import { callModel } from '../llm/model.js';
import { wrapTool } from '../llm/wrapTool.js';
import type { DbMessage } from '../types/index.js';
import { toolRegistry, type Tool } from '../tools/registry.js';
import { appendMessage } from '../db/conversations.js';
import type { AgentInput, StreamDelta, ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';
import type { TurnContext } from '@openrouter/sdk/lib/tool-types.js';
import type { OpenResponsesResult } from '@openrouter/sdk/models/openresponsesresult.js';
import type { ChatStreamChunk } from '@openrouter/sdk/models/chatstreamchunk.js';
import type { EventStream } from '@openrouter/sdk/lib/event-streams.js';
import type { ModelResult } from '@openrouter/sdk/lib/model-result.js';
import type { Tool as SdkTool } from '@openrouter/sdk/lib/tool-types.js';
import type { ResponseFormat } from '@openrouter/sdk/models/chatrequest.js';
import { callOpenAICompatModel } from '../llm/openai-client.js';

const MAX_TURNS = 5;

function isResponsesModelResult(
  result: ModelResult<readonly SdkTool[]> | EventStream<ChatStreamChunk>,
): result is ModelResult<readonly SdkTool[]> {
  return typeof (result as ModelResult<readonly SdkTool[]>).getFullResponsesStream === 'function';
}

type RunOptions = {
  history?: DbMessage[];
  extraTools?: Tool[];
  onDelta?: (delta: StreamDelta) => void;
  maxTurns?: number;
  sdkContext?: Record<string, Record<string, unknown>>;
  responseFormat?: ResponseFormat;
  noTools?: boolean;
  temperature?: number;
};
export class AgentCore {
  async run(input: AgentInput, context: ToolContext, options: RunOptions = {}): Promise<string> {
    const {
      history = [],
      extraTools = [],
      onDelta,
      maxTurns = MAX_TURNS,
      sdkContext,
      responseFormat,
      temperature,
      noTools,
    } = options;

    const { conversationId } = context;
    const toolDefs = [...toolRegistry.getAll(), ...extraTools];
    const sdkTools = noTools
      ? []
      : toolDefs.map((def) => wrapTool(def, context, onDelta, conversationId));

    logger.debug('Agent run', {
      conversationId,
      historyItems: history.length,
    });

    const modelResult = await callOpenAICompatModel(input, sdkTools, {
      temperature,
      responseFormat,
      maxTurns,
      sdkContext,
      onTurnEnd: async (_ctx: TurnContext, response: OpenResponsesResult) => {
        // Save assistant turns that include tool calls to DB
        let assistantText = '';
        const toolCalls: Array<{
          callId: string;
          toolName: string;
          arguments: string;
        }> = [];

        for (const item of response.output) {
          if (item.type === 'message') {
            for (const c of item.content) {
              if ('text' in c) assistantText += c.text;
            }
          } else if (item.type === 'function_call') {
            toolCalls.push({
              callId: item.callId,
              toolName: item.name,
              arguments: item.arguments,
            });
          }
        }

        if (toolCalls.length > 0) {
          onDelta?.({
            type: 'router_decision',
            toolNames: toolCalls.map((tc) => tc.toolName),
          });
          conversationId &&
            appendMessage({
              conversationId,
              role: 'assistant',
              content: assistantText,
              toolCallsJson: JSON.stringify(toolCalls),
            });
        }
      },
    });

    let finalContent = '';
    let finalReasoning = '';

    try {
      if (isResponsesModelResult(modelResult.result)) {
        for await (const event of modelResult.result.getFullResponsesStream()) {
          if (event.type === 'response.output_text.delta') {
            finalContent += event.delta;
            onDelta?.({ type: 'content', text: event.delta });
          } else if (
            event.type === 'response.reasoning_text.delta' ||
            event.type === 'response.reasoning_summary_text.delta'
          ) {
            finalReasoning += event.delta;
            // Only display reasoning before content starts to avoid interleaved flickering
            if (!finalContent) {
              onDelta?.({ type: 'reasoning', text: event.delta });
            }
          }
        }
      } else {
        for await (const chunk of modelResult.result) {
          const choice = chunk.choices[0];
          const delta = choice?.delta;
          if (!delta) continue;

          if (delta.content) {
            finalContent += delta.content;
            onDelta?.({ type: 'content', text: delta.content });
          }

          if (delta.reasoning) {
            finalReasoning += delta.reasoning;
            if (!finalContent) {
              onDelta?.({ type: 'reasoning', text: delta.reasoning });
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Model call failed', { error: msg });
      finalContent = `Error: ${msg}`;
      onDelta?.({ type: 'content', text: finalContent });
    }

    onDelta?.({ type: 'done' });

    conversationId &&
      appendMessage({
        conversationId,
        role: 'assistant',
        content: finalContent,
        reasoningContent: finalReasoning || undefined,
      });

    return finalContent;
  }
}

export const agentCore = new AgentCore();
