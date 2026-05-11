import { openrouterClient } from './client.js';
import { env } from '../config/env.js';
import { parseProviderString } from '../utils/format.js';
import { appendMessage } from '../db/conversations.js';
import type { ToolContext, StreamDelta } from '../types/index.js';
import type { EasyInputMessage } from '@openrouter/sdk/models/easyinputmessage.js';
import type { FunctionCallItem } from '@openrouter/sdk/models/functioncallitem.js';
import type { FunctionCallOutputItem } from '@openrouter/sdk/models/functioncalloutputitem.js';
import type { InputsUnion1 } from '@openrouter/sdk/models/inputsunion.js';
import type { ModelResult } from '@openrouter/sdk/lib/model-result.js';
import type { Tool, TurnContext } from '@openrouter/sdk/lib/tool-types.js';
import type { OpenResponsesResult } from '@openrouter/sdk/models/openresponsesresult.js';
import { tool } from '@openrouter/sdk/lib/tool.js';
import { stepCountIs } from '@openrouter/sdk/lib/stop-conditions.js';
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

/** Convert DB message rows to Responses API input array */
export function toResponsesInput(messages: DbMessage[]): InputItem[] {
  const result: InputItem[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const item: EasyInputMessage = { role: 'user', content: msg.content };
      result.push(item);
    } else if (msg.role === 'assistant' && msg.toolCallsJson) {
      const toolCalls = JSON.parse(msg.toolCallsJson) as Array<{
        callId: string; toolName: string; arguments: string;
      }>;
      if (msg.content) result.push({ role: 'assistant', content: msg.content } as EasyInputMessage);
      for (const tc of toolCalls) {
        result.push({
          type: 'function_call', id: tc.callId, callId: tc.callId,
          name: tc.toolName, arguments: tc.arguments,
        } as FunctionCallItem);
      }
    } else if (msg.role === 'assistant') {
      result.push({ role: 'assistant', content: msg.content } as EasyInputMessage);
    } else if (msg.role === 'tool') {
      result.push({
        type: 'function_call_output', callId: msg.toolCallId ?? '', output: msg.content,
      } as FunctionCallOutputItem);
    }
  }
  return result;
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
        onDelta?.({ type: 'tool_end', toolName: fn.name, toolOutput: out, toolSuccess: true });
      } catch (err) {
        out = `Error: ${String(err)}`;
        onDelta?.({ type: 'tool_end', toolName: fn.name, toolOutput: out, toolSuccess: false });
      }

      const callId = sdkCtx?.toolCall?.callId;
      if (callId) {
        appendMessage({ conversationId, role: 'tool', content: out, toolCallId: callId, toolName: fn.name });
      }

      return out;
    },
  }) as unknown as Tool;
}

export function callModel(
  input: InputItem[],
  sdkTools: Tool[],
  systemPrompt: string,
  opts: CallModelOptions = {},
): ModelResult<readonly Tool[]> {
  const provider = parseProviderString(env.provider);

  logger.debug('Model call', {
    model: env.model,
    inputItems: input.length,
    tools: sdkTools.map((t) => t.function.name),
  });

  return openrouterClient.callModel({
    model: env.model,
    instructions: systemPrompt,
    input: input as unknown as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: sdkTools as unknown as any,
    ...(env.contextCompression && { plugins: [{ id: 'context-compression' as const }] }),
    ...(provider && { provider }),
    ...(opts.maxTurns !== undefined && { stopWhen: stepCountIs(opts.maxTurns) }),
    ...(opts.sdkContext && { context: opts.sdkContext as never }),
    onTurnEnd: opts.onTurnEnd,
  });
}
