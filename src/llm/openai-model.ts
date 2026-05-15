import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions.js';
import type { Tool } from '@openrouter/sdk/lib/tool-types.js';
import type { ResponseFormat } from '@openrouter/sdk/models/chatrequest.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { AgentInput, CallModelOptions } from '../types/index.js';
import type { CallModelResult } from './model.js';

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: env.openaiCompatApiKey,
    baseURL: env.openaiCompatBaseUrl || undefined,
  });
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function buildMessages(input: AgentInput): ChatCompletionMessageParam[] {
  const msgs: ChatCompletionMessageParam[] = [];

  if (input.systemPrompt) {
    msgs.push({ role: 'system', content: input.systemPrompt });
  }

  const { text, image } = input.userPrompt;

  if (!image) {
    // Text-only user message
    const content = Array.isArray(text) ? text.join('\n') : (text ?? '');
    msgs.push({ role: 'user', content });
  } else {
    // Multi-modal: text + image(s)
    const parts: OpenAI.ChatCompletionContentPart[] = [];

    if (text) {
      const t = Array.isArray(text) ? text.join('\n') : text;
      parts.push({ type: 'text', text: t });
    }

    const images = Array.isArray(image) ? image : [image];
    for (const img of images) {
      parts.push({ type: 'image_url', image_url: { url: img.url } });
      if (img.caption) parts.push({ type: 'text', text: img.caption });
    }

    msgs.push({ role: 'user', content: parts });
  }

  return msgs;
}

function convertResponseFormat(
  rf: ResponseFormat,
):
  | OpenAI.ResponseFormatText
  | OpenAI.ResponseFormatJSONObject
  | OpenAI.ResponseFormatJSONSchema
  | undefined {
  if (rf.type === 'text') return { type: 'text' };
  if (rf.type === 'json_object') return { type: 'json_object' };
  if (rf.type === 'json_schema' && rf.jsonSchema) {
    const js = rf.jsonSchema;
    return {
      type: 'json_schema',
      json_schema: {
        name: js.name ?? 'response',
        description: js.description,
        schema: js.schema,
        strict: js.strict ?? true,
      },
    };
  }
  return undefined;
}

function convertTools(sdkTools: Tool[]): ChatCompletionTool[] {
  return sdkTools.map((t) => {
    const fn = t.function;
    const rawSchema = (fn as any).inputSchema;
    // inputSchema may be a Zod schema (has ._def) or already a plain JSON Schema object
    const parameters =
      rawSchema && typeof rawSchema === 'object' && '_def' in rawSchema
        ? zodToJsonSchema(rawSchema)
        : (rawSchema ?? { type: 'object', properties: {} });

    return {
      type: 'function' as const,
      function: {
        name: fn.name,
        description: fn.description ?? '',
        parameters: parameters as Record<string, unknown>,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Tool execution loop (async generator)
// ---------------------------------------------------------------------------

async function* toolLoop(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  sdkTools: Tool[],
  opts: CallModelOptions,
): AsyncGenerator<ChatCompletionChunk> {
  const maxTurns = opts.maxTurns ?? 5;
  const openAiTools = sdkTools.length ? convertTools(sdkTools) : undefined;
  const responseFormat = opts.responseFormat
    ? convertResponseFormat(opts.responseFormat)
    : undefined;

  for (let turn = 0; turn < maxTurns; turn++) {
    const stream = await client.chat.completions.create({
      model: env.openaiCompatModel || env.model,
      messages,
      tools: openAiTools,
      stream: true,
      ...(opts.temperature !== undefined && { temperature: opts.temperature }),
      ...(env.maxOutputTokens > 0 && { max_tokens: env.maxOutputTokens }),
      ...(responseFormat && { response_format: responseFormat }),
    });

    // Accumulate tool call deltas while streaming content chunks through
    const toolCallAccum: Record<number, { id: string; name: string; arguments: string }> = {};
    let assistantContent = '';

    for await (const chunk of stream) {
      yield chunk;

      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) assistantContent += delta.content;

      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index;
        if (!toolCallAccum[idx]) {
          toolCallAccum[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' };
        } else {
          if (tc.id) toolCallAccum[idx].id = tc.id;
          if (tc.function?.name) toolCallAccum[idx].name += tc.function.name;
        }
        if (tc.function?.arguments) toolCallAccum[idx].arguments += tc.function.arguments;
      }
    }

    const toolCalls = Object.values(toolCallAccum);
    if (toolCalls.length === 0) break; // model is done

    // Append assistant turn with tool_calls
    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // Execute each tool and append results
    for (const tc of toolCalls) {
      const sdkTool = sdkTools.find((t) => t.function.name === tc.name);
      let result = `Tool "${tc.name}" not found`;

      if (sdkTool) {
        try {
          const args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
          const execFn = (sdkTool.function as any).execute as (
            p: unknown,
            ctx: unknown,
          ) => Promise<unknown>;
          result = String(await execFn(args, { toolCall: { callId: tc.id } }));
        } catch (err) {
          result = `Error: ${String(err)}`;
        }
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function callOpenAICompatModel(
  input: AgentInput,
  sdkTools: Tool[],
  opts: CallModelOptions = {},
): Promise<CallModelResult> {
  const client = createClient();
  const messages = buildMessages(input);

  logger.debug('Model call (openai-compat)', {
    model: env.openaiCompatModel || env.model,
    hasImages: !!input.userPrompt.image,
    tools: sdkTools.map((t) => t.function.name),
  });

  const generator = toolLoop(client, messages, sdkTools, opts);

  // Wrap the generator in an object that looks like EventStream<ChatStreamChunk>
  // core.ts's else-branch just does: for await (const chunk of result) { chunk.choices[0].delta }
  return { kind: 'stream', result: generator as any };
}
