import { openrouterClient } from './client.js';
import { env } from '../config/env.js';
import { parseProviderString } from '../utils/format.js';
import { appendMessage } from '../db/conversations.js';
import type { AgentContentPart, AgentInput, ToolContext, StreamDelta } from '../types/index.js';
import type { EasyInputMessage } from '@openrouter/sdk/models/easyinputmessage.js';
import type { FunctionCallItem } from '@openrouter/sdk/models/functioncallitem.js';
import type { FunctionCallOutputItem } from '@openrouter/sdk/models/functioncalloutputitem.js';
import type { InputsUnion1 } from '@openrouter/sdk/models/inputsunion.js';
import type { ModelResult } from '@openrouter/sdk/lib/model-result.js';
import type { Tool, TurnContext } from '@openrouter/sdk/lib/tool-types.js';
import type { OpenResponsesResult } from '@openrouter/sdk/models/openresponsesresult.js';
import type { ChatMessages } from '@openrouter/sdk/models/chatmessages.js';
import type { ChatContentItems } from '@openrouter/sdk/models/chatcontentitems.js';
import type { ChatContentText } from '@openrouter/sdk/models/chatcontenttext.js';
import type { ChatContentImage } from '@openrouter/sdk/models/chatcontentimage.js';
import { tool } from '@openrouter/sdk/lib/tool.js';
import { maxTokensUsed, stepCountIs } from '@openrouter/sdk/lib/stop-conditions.js';
import { logger } from '../utils/logger.js';

export type DbMessage = {
  role: string;
  content: string;
  toolCallsJson?: string | null;
  toolCallId?: string | null;
};

export type CallModelOptions = {
  maxTurns?: number;
  onTurnEnd?: (ctx: TurnContext, response: OpenResponsesResult) => void | Promise<void>;
  /** Per-tool context data injected via contextSchema (e.g. { cron_create: { telegramChatId: 123 } }) */
  sdkContext?: Record<string, Record<string, unknown>>;
};

type InputItem = InputsUnion1;

export type CallModelResult =
  | { kind: 'responses'; result: ModelResult<readonly Tool[]> }
  | { kind: 'chat'; content: string };

/** Convert DB message rows to Responses API input array */
export function toResponsesInput(messages: DbMessage[]): InputItem[] {
  const result: InputItem[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const item: EasyInputMessage = { role: 'user', content: msg.content };
      result.push(item);
    } else if (msg.role === 'assistant' && msg.toolCallsJson) {
      const toolCalls = JSON.parse(msg.toolCallsJson) as Array<{
        callId: string;
        toolName: string;
        arguments: string;
      }>;
      if (msg.content)
        result.push({
          role: 'assistant',
          content: msg.content,
        } as EasyInputMessage);
      for (const tc of toolCalls) {
        result.push({
          type: 'function_call',
          id: tc.callId,
          callId: tc.callId,
          name: tc.toolName,
          arguments: tc.arguments,
        } as FunctionCallItem);
      }
    } else if (msg.role === 'assistant') {
      result.push({
        role: 'assistant',
        content: msg.content,
      } as EasyInputMessage);
    } else if (msg.role === 'tool') {
      result.push({
        type: 'function_call_output',
        callId: msg.toolCallId ?? '',
        output: msg.content,
      } as FunctionCallOutputItem);
    }
  }
  return result;
}

function isTextOnly(input: AgentInput): boolean {
  return input.parts.every((part) => part.type === 'text');
}

function toChatContent(parts: AgentContentPart[]): ChatContentItems[] {
  return parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text } as ChatContentText;
    }
    return { type: 'image_url', imageUrl: { url: part.url } } as ChatContentImage;
  });
}

function toChatMessages(
  history: DbMessage[],
  systemPrompt: string,
  input: AgentInput,
): ChatMessages[] {
  const userContent = toChatContent(input.parts);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
}

/**
 * Wrap an SDK tool to add interactive approval, streaming deltas, and DB persistence.
 * The original tool's execute is called unchanged; this layer handles infrastructure.
 */
export function wrapTool(
  sdkTool: Tool,
  context: ToolContext,
  onDelta: ((delta: StreamDelta) => void) | undefined,
  conversationId: string,
): Tool {
  const fn = sdkTool.function;
  const needsApproval = fn.requireApproval === true;

  return tool({
    name: fn.name,
    description: fn.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: fn.inputSchema as any,
    execute: async (params: Record<string, unknown>, sdkCtx) => {
      if (needsApproval) {
        const approved = await context.requestApproval(
          `Use tool "${fn.name}" with args: ${JSON.stringify(params)}`,
        );
        if (!approved) {
          onDelta?.({ type: 'tool_skipped', toolName: fn.name });
          return 'Tool execution was not approved by user.';
        }
      }

      onDelta?.({ type: 'tool_start', toolName: fn.name, toolArgs: params });
      logger.debug(`Executing tool: ${fn.name}`);

      let out: string;
      try {
        const execFn = (fn as { execute: (p: unknown, c: unknown) => unknown }).execute;
        const raw = await execFn(params, sdkCtx);
        out = String(raw ?? '');
        onDelta?.({
          type: 'tool_end',
          toolName: fn.name,
          toolOutput: out,
          toolSuccess: true,
        });
      } catch (err) {
        out = `Error: ${String(err)}`;
        onDelta?.({
          type: 'tool_end',
          toolName: fn.name,
          toolOutput: out,
          toolSuccess: false,
        });
      }

      const callId = sdkCtx?.toolCall?.callId;
      if (callId) {
        appendMessage({
          conversationId,
          role: 'tool',
          content: out,
          toolCallId: callId,
          toolName: fn.name,
        });
      }

      return out;
    },
  }) as unknown as Tool;
}

export async function callModel(
  input: AgentInput,
  history: DbMessage[],
  sdkTools: Tool[],
  systemPrompt: string,
  opts: CallModelOptions = {},
): Promise<CallModelResult> {
  const provider = parseProviderString(env.provider);

  if (!isTextOnly(input)) {
    logger.debug('Model call (chat)', {
      model: env.model,
      historyItems: history.length,
    });
    const response = await openrouterClient.chat.send({
      chatRequest: {
        model: env.model,
        messages: toChatMessages(history, systemPrompt, input),
        // ...(env.maxOutputTokens > 0 && {
        //   maxCompletionTokens: env.maxOutputTokens,
        // }),
        // ...(provider && { provider }),
      },
    });

    return {
      kind: 'chat',
      content: response.choices[0]?.message?.content ?? '',
    };
  }

  const inputItems = toResponsesInput(history);

  logger.debug('Model call', {
    model: env.model,
    inputItems: inputItems.length,
    tools: sdkTools.map((t) => t.function.name),
  });

  const stopWhen = [
    ...(opts.maxTurns !== undefined ? [stepCountIs(opts.maxTurns)] : []),
    ...(env.maxOutputTokens > 0 ? [maxTokensUsed(env.maxOutputTokens)] : []),
  ];

  const result = openrouterClient.callModel({
    model: env.model,
    instructions: systemPrompt,
    input: inputItems,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: sdkTools,
    ...(env.contextCompression && {
      plugins: [{ id: 'context-compression' as const }],
    }),
    ...(provider && { provider }),
    ...(stopWhen.length > 0 && { stopWhen }),
    ...(opts.sdkContext && { context: opts.sdkContext as never }), // Need consider
    onTurnEnd: opts.onTurnEnd,
  });

  return { kind: 'responses', result };
}
