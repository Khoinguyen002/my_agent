import type { Tool } from '@openrouter/sdk/lib/tool-types.js';
import { tool } from '@openrouter/sdk/lib/tool.js';
import { appendMessage } from '../db/conversations.js';
import type { StreamDelta, ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Wrap an SDK tool to add interactive approval, streaming deltas, and DB persistence.
 * The original tool's execute is called unchanged; this layer handles infrastructure.
 */
export function wrapTool(
  sdkTool: Tool,
  context: ToolContext,
  onDelta: ((delta: StreamDelta) => void) | undefined,
  conversationId?: string,
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
      if (callId && conversationId) {
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
