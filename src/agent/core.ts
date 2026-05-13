import { callModel, type DbMessage, wrapTool } from "../llm/model.js";
import { toolRegistry, type Tool } from "../tools/registry.js";
import { appendMessage } from "../db/conversations.js";
import type { AgentInput, StreamDelta, ToolContext } from "../types/index.js";
import { logger } from "../utils/logger.js";
import type { TurnContext } from "@openrouter/sdk/lib/tool-types.js";
import type { OpenResponsesResult } from "@openrouter/sdk/models/openresponsesresult.js";

const MAX_TURNS = 5;

const SYSTEM_PROMPT = `You are a helpful AI agent. You have access to various tools to help users accomplish tasks.
When using tools, be transparent about what you're doing and why. Always provide clear, concise responses.`;

type RunOptions = {
  history?: DbMessage[];
  extraTools?: Tool[];
  onDelta?: (delta: StreamDelta) => void;
  systemPrompt?: string;
  maxTurns?: number;
  sdkContext?: Record<string, Record<string, unknown>>;
};
export class AgentCore {
  async run(
    input: AgentInput,
    context: ToolContext,
    options: RunOptions = {},
  ): Promise<string> {
    const {
      history = [],
      extraTools = [],
      onDelta,
      systemPrompt = SYSTEM_PROMPT,
      maxTurns = MAX_TURNS,
      sdkContext,
    } = options;

    const { conversationId } = context;
    const toolDefs = [...toolRegistry.getAll(), ...extraTools];
    const sdkTools = toolDefs.map((def) =>
      wrapTool(def, context, onDelta, conversationId),
    );

    logger.debug("Agent run", {
      conversationId,
      historyItems: history.length,
    });

    const modelResult = await callModel(input, history, sdkTools, systemPrompt, {
      maxTurns,
      sdkContext,
      onTurnEnd: async (_ctx: TurnContext, response: OpenResponsesResult) => {
        // Save assistant turns that include tool calls to DB
        let assistantText = "";
        const toolCalls: Array<{
          callId: string;
          toolName: string;
          arguments: string;
        }> = [];

        for (const item of response.output) {
          if (item.type === "message") {
            for (const c of item.content) {
              if ("text" in c) assistantText += c.text;
            }
          } else if (item.type === "function_call") {
            toolCalls.push({
              callId: item.callId,
              toolName: item.name,
              arguments: item.arguments,
            });
          }
        }

        if (toolCalls.length > 0) {
          onDelta?.({
            type: "router_decision",
            toolNames: toolCalls.map((tc) => tc.toolName),
          });
          appendMessage({
            conversationId,
            role: "assistant",
            content: assistantText,
            toolCallsJson: JSON.stringify(toolCalls),
          });
        }
      },
    });

    if (modelResult.kind === "chat") {
      const content = modelResult.content;
      if (content) onDelta?.({ type: "content", text: content });
      onDelta?.({ type: "done" });
      appendMessage({
        conversationId,
        role: "assistant",
        content: content,
      });
      return content;
    }

    let finalContent = "";
    let finalReasoning = "";

    try {
      for await (const event of modelResult.result.getFullResponsesStream()) {
        if (event.type === "response.output_text.delta") {
          finalContent += event.delta;
          onDelta?.({ type: "content", text: event.delta });
        } else if (
          event.type === "response.reasoning_text.delta" ||
          event.type === "response.reasoning_summary_text.delta"
        ) {
          finalReasoning += event.delta;
          // Only display reasoning before content starts to avoid interleaved flickering
          if (!finalContent) {
            onDelta?.({ type: "reasoning", text: event.delta });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Model call failed", { error: msg });
      finalContent = `Error: ${msg}`;
      onDelta?.({ type: "content", text: finalContent });
    }

    onDelta?.({ type: "done" });

    appendMessage({
      conversationId,
      role: "assistant",
      content: finalContent,
      reasoningContent: finalReasoning || undefined,
    });

    return finalContent;
  }
}

export const agentCore = new AgentCore();
