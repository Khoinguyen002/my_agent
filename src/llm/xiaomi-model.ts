import type { Tool } from '@openrouter/sdk/lib/tool-types.js';
import type { ResponseFormat } from '@openrouter/sdk/models/chatrequest.js';
import { env } from '../config/env.js';
import type { AgentInput, CallModelOptions } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { buildMessages, parseSSE } from './helpers/xiaomi-model/index.js';
import type { CallModelResult } from './model.js';
import {
  XOAIFunctionTool,
  XOAIMessage,
  XOAIRequestBody,
  XOAIResponseFormat,
} from './types/xiaomi-model/request-body.js';
import {
  XOAIChatCompletionChunk,
  XOAIChatCompletionToolCallDelta,
} from './types/xiaomi-model/response.js';

// ---------------------------------------------------------------------------
// Local types matching OpenAI chat completions wire format
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

// function convertTools(sdkTools: Tool[]): XOAIAssistantToolCall[] {
//   return sdkTools.map((t) => {
//     const fn = t.function;
//     const rawSchema = (fn as any).inputSchema;
//     const parameters =
//       rawSchema && typeof rawSchema === 'object' && '_def' in rawSchema
//         ? zodToJsonSchema(rawSchema)
//         : (rawSchema ?? { type: 'object', properties: {} });

//     return {
//       type: 'function',
//       function: {
//         name: fn.name,
//         description: fn.description ?? '',
//         parameters: parameters as Record<string, unknown>,
//       },
//     };
//   });
// }

function convertResponseFormat(rf: ResponseFormat): XOAIResponseFormat | undefined {
  if (rf.type === 'text') return { type: 'text' };
  if (rf.type === 'json_object') return { type: 'json_object' };
  if (rf.type === 'json_schema' && rf.jsonSchema) {
    return {
      type: 'json_object',
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tool execution loop
// ---------------------------------------------------------------------------

async function* toolLoop(
  messages: XOAIMessage[],
  sdkTools: Tool[],
  opts: CallModelOptions,
): AsyncGenerator<XOAIChatCompletionChunk> {
  const maxTurns = opts.maxTurns ?? 5;
  // const oaiTools = sdkTools.length ? convertTools(sdkTools) : undefined;
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
      thinking: { type: 'enabled' },
      tools: [
        // ...mcpTools,
        {
          type: 'function',
          function: {
            name: 'get_time',
            description: 'Get the current time',
          },
        },
      ],
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

    const accumulativeToolCalls: Record<number, XOAIChatCompletionToolCallDelta> = {};
    let assistantContent = '';
    let reasoningContent = '';
    let lastChunk: XOAIChatCompletionChunk | null = null;

    for await (const chunk of parseSSE(response.body)) {
      lastChunk = chunk;
      yield chunk;
      const delta = chunk.choices[0]?.delta;

      if (!delta) continue;

      if (delta.content) assistantContent += delta.content;
      if (delta.reasoning_content) reasoningContent += delta.reasoning_content;

      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index;
        accumulativeToolCalls[idx] = tc;
      }
    }

    const toolCalls = Object.values(accumulativeToolCalls);

    if (assistantContent || reasoningContent) {
      logger.info('Xiaomi model turn output', {
        turn: turn + 1,
        assistantContent,
        reasoningContent,
        usage: lastChunk?.usage ?? null,
        finishReason: lastChunk?.choices[0]?.finish_reason ?? null,
        toolCalls: toolCalls.map((tc) => tc.function?.name).filter(Boolean),
      });
    }

    if (toolCalls.length === 0) break;

    messages.push({
      role: 'assistant',
      content: assistantContent,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: tc.function,
      })),
      reasoning_content: reasoningContent,
    });

    for (const tc of toolCalls) {
      if (tc.function.name === 'get_time') {
        const now = new Date().toISOString();
        messages.push({
          role: 'tool',
          tool_call_id: tc.id ?? '',
          content: `Current time is ${now}`,
        });
        continue;
      }
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
    model: env.xiaomiModel,
    baseUrl: env.xiaomiBaseUrl,
    hasImages: !!input.userPrompt.image,
    tools: sdkTools.map((t) => t.function.name),
  });

  const generator = toolLoop(messages, sdkTools, opts);

  return { kind: 'stream', result: generator as any };
}
