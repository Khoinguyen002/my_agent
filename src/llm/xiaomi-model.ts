import type { Tool } from '@openrouter/sdk/lib/tool-types.js';
import type { ResponseFormat } from '@openrouter/sdk/models/chatrequest.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { AgentInput, CallModelOptions, DbMessage } from '../types/index.js';
import type { CallModelResult } from './model.js';
import {
  XOAIMessage,
  XOAIContentPart,
  XOAITool,
  XOAIResponseFormat,
  XOAIChunk,
  XOAIRequestBody,
} from './types/xiaomi-model/request-body.js';

// ---------------------------------------------------------------------------
// Local types matching OpenAI chat completions wire format
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function buildMessages(input: AgentInput): XOAIMessage[] {
  const msgs: XOAIMessage[] = [
    { role: 'system', content: 'English is the primary language for all conversations.' },
  ];

  if (input.systemPrompt) {
    msgs.push({ role: 'system', content: input.systemPrompt });
  }

  // Insert conversation history before the current user turn
  if (input.history?.length) {
    for (const msg of input.history) {
      if (msg.role === 'assistant' && msg.toolCallsJson) {
        const toolCalls = JSON.parse(msg.toolCallsJson) as Array<{
          callId: string;
          toolName: string;
          arguments: string;
        }>;
        msgs.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.callId,
            type: 'function' as const,
            function: { name: tc.toolName, arguments: tc.arguments },
          })),
        });
      } else if (msg.role === 'tool' && msg.toolCallId) {
        msgs.push({ role: 'tool', content: msg.content, tool_call_id: msg.toolCallId });
      } else {
        msgs.push({
          role: msg.role as XOAIMessage['role'],
          content: msg.content,
        });
      }
    }
  }

  const { text, image } = input.userPrompt;

  if (!image) {
    const content = Array.isArray(text) ? text.join('\n') : (text ?? '');
    msgs.push({ role: 'user', content });
  } else {
    const parts: XOAIContentPart[] = [];

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

function convertTools(sdkTools: Tool[]): XOAITool[] {
  return sdkTools.map((t) => {
    const fn = t.function;
    const rawSchema = (fn as any).inputSchema;
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

function convertResponseFormat(rf: ResponseFormat): XOAIResponseFormat | undefined {
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

// ---------------------------------------------------------------------------
// SSE parser: ReadableStream → AsyncGenerator<XOAIChunk>
// ---------------------------------------------------------------------------

async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<XOAIChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          yield JSON.parse(data) as XOAIChunk;
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Tool execution loop
// ---------------------------------------------------------------------------

async function* toolLoop(
  messages: XOAIMessage[],
  sdkTools: Tool[],
  opts: CallModelOptions,
): AsyncGenerator<XOAIChunk> {
  const maxTurns = opts.maxTurns ?? 5;
  const oaiTools = sdkTools.length ? convertTools(sdkTools) : undefined;
  const responseFormat = opts.responseFormat
    ? convertResponseFormat(opts.responseFormat)
    : undefined;

  const model = env.xiaomiModel;
  const baseUrl = env.xiaomiBaseUrl;
  const apiKey = env.xiaomiApiKey;

  for (let turn = 0; turn < maxTurns; turn++) {
    const body: XOAIRequestBody = {
      model,
      messages,
      stream: true,
      ...(oaiTools && { tools: oaiTools }),
      ...(opts.temperature !== undefined && { temperature: opts.temperature }),
      ...(env.maxOutputTokens > 0 && { max_completion_tokens: env.maxOutputTokens }),
      ...(responseFormat && { response_format: responseFormat }),
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Xiaomi API error ${response.status}: ${errText}`);
    }

    const toolCallAccum: Record<number, { id: string; name: string; arguments: string }> = {};
    let assistantContent = '';

    for await (const chunk of parseSSE(response.body)) {
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
    if (toolCalls.length === 0) break;

    messages.push({
      role: 'assistant',
      content: assistantContent,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

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

export async function callXiaomiModel(
  input: AgentInput,
  sdkTools: Tool[],
  opts: CallModelOptions = {},
): Promise<CallModelResult> {
  const messages = buildMessages(input);

  logger.debug('Model call (xiaomi)', {
    model: env.xiaomiModel || env.model,
    baseUrl: env.xiaomiBaseUrl,
    hasImages: !!input.userPrompt.image,
    tools: sdkTools.map((t) => t.function.name),
  });

  const generator = toolLoop(messages, sdkTools, opts);

  return { kind: 'stream', result: generator as any };
}
