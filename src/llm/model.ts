import type { EventStream } from '@openrouter/sdk/lib/event-streams.js';
import type { ModelResult } from '@openrouter/sdk/lib/model-result.js';
import { maxTokensUsed, stepCountIs } from '@openrouter/sdk/lib/stop-conditions.js';
import type { Tool } from '@openrouter/sdk/lib/tool-types.js';
import type { ChatStreamChunk } from '@openrouter/sdk/models/chatstreamchunk.js';
import { env } from '../config/env.js';
import type { AgentInput, CallModelOptions } from '../types/index.js';
import { parseProvidersString } from '../utils/format.js';
import { logger } from '../utils/logger.js';
import { openrouterClient } from './client.js';
import { agentInputToChatMessage, agentInputToInputsUnion1 } from './helpers/index.js';
import { callOpenAICompatModel } from './openai-model.js';
import { callXiaomiModel } from './xiaomi-model.js';

export type CallModelResult = {
  kind: 'stream';
  result: ModelResult<readonly Tool[]> | EventStream<ChatStreamChunk>;
};

function hasImages(input: AgentInput): boolean {
  return !!input.userPrompt.image;
}

/**
 * Unified model call.
 *
 * - input contains images  → Chat Completions API (chat.send), which supports vision
 * - input is text only     → Responses API (callModel), which supports tools & multi-turn
 *
 * Callers pass AgentInput and never need to know which underlying API is used.
 */
export async function callModel(
  input: AgentInput,
  sdkTools: Tool[],
  opts: CallModelOptions = {},
): Promise<CallModelResult> {
  if (env.xiaomiApiKey) {
    return callXiaomiModel(input, sdkTools, opts);
  }

  if (env.openaiCompatApiKey) {
    return callOpenAICompatModel(input, sdkTools, opts);
  }

  const provider = parseProvidersString(env.providers);

  if (hasImages(input)) {
    logger.debug('Model call (vision → chat.send)', {
      model: env.model,
      historyItems: input.history?.length ?? 0,
    });

    const response = await openrouterClient.chat.send({
      chatRequest: {
        model: env.model,
        messages: agentInputToChatMessage(input),
        ...(opts.responseFormat && { responseFormat: opts.responseFormat }),
        ...(env.maxOutputTokens > 0 && {
          maxCompletionTokens: env.maxOutputTokens,
          maxTokens: env.maxOutputTokens,
        }),
        ...(provider && { provider }),
        tools: sdkTools.length ? sdkTools : undefined,
        stream: true,
        temperature: opts.temperature,
      },
    });

    return { kind: 'stream', result: response };
  }

  // Text-only → Responses API (tools, multi-turn, context-compression)
  const inputItems = agentInputToInputsUnion1(input);

  const stopWhen = [
    ...(opts.maxTurns !== undefined ? [stepCountIs(opts.maxTurns)] : []),
    ...(env.maxOutputTokens > 0 ? [maxTokensUsed(env.maxOutputTokens)] : []),
  ];

  logger.debug('Model call (text → callModel)', {
    model: env.model,
    inputItems: inputItems.length,
    tools: sdkTools.map((t) => t.function.name),
  });

  const result = openrouterClient.callModel({
    model: env.model,
    instructions: input.systemPrompt,
    input: inputItems,
    tools: sdkTools,
    onTurnEnd: opts.onTurnEnd,
    ...(opts.responseFormat && { responseFormat: opts.responseFormat }),
    ...(env.contextCompression && { plugins: [{ id: 'context-compression' as const }] }),
    ...(provider && { provider }),
    ...(stopWhen.length > 0 && { stopWhen }),
    ...(opts.sdkContext && { context: opts.sdkContext as never }),
  });

  return { kind: 'stream', result };
}
