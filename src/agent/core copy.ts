import { callModel } from '../llm/model.js';
import { wrapTool } from '../llm/wrapTool.js';
import type { DbMessage, AgentInput, StreamDelta, ToolContext } from '../types/index.js';
import { toolRegistry, type Tool } from '../tools/registry.js';
import { appendMessage } from '../db/conversations.js';
import { logger } from '../utils/logger.js';
import { ErrorHandler, ModelError, ValidationError } from '../errors/index.js';
import { validate, AgentInputSchema } from '../validation/index.js';
import type { TurnContext, Tool as SdkTool } from '@openrouter/sdk/lib/tool-types.js';
import type { OpenResponsesResult } from '@openrouter/sdk/models/openresponsesresult.js';
import type { ChatStreamChunk } from '@openrouter/sdk/models/chatstreamchunk.js';
import type { EventStream } from '@openrouter/sdk/lib/event-streams.js';
import type { ModelResult } from '@openrouter/sdk/lib/model-result.js';
import type { ResponseFormat } from '@openrouter/sdk/models/chatrequest.js';
import { XOAIRequestBody } from '../llm/types/xiaomi-model/request-body.js';

const MAX_TURNS = 5;

/**
 * Type guard to check if the model result is a Responses API result
 * @param result - The model result to check
 * @returns True if the result is a ModelResult with getFullResponsesStream method
 */
function isResponsesModelResult(
  result: ModelResult<readonly SdkTool[]> | EventStream<ChatStreamChunk>,
): result is ModelResult<readonly SdkTool[]> {
  return typeof (result as ModelResult<readonly SdkTool[]>).getFullResponsesStream === 'function';
}

/**
 * Options for running the agent
 */
type RunParams = {
  input: AgentInput;
  context: { conversationId?: string };
  options: {
    /** Additional tools to register for this run */
    tools?: Tool[];
    /** Callback for streaming response deltas */
    onDelta?: (delta: StreamDelta) => void;
    /** Maximum number of tool call turns */
    maxTurns?: number;
    /** Response format specification */
    responseFormat?: ResponseFormat;
    /** Temperature for model sampling */
    temperature?: number;
  };
};

/**
 * Core agent class that orchestrates model calls and tool execution
 *
 * The AgentCore is responsible for:
 * - Validating input
 * - Managing tool registration and execution
 * - Calling the AI model
 * - Streaming responses
 * - Persisting conversation history
 *
 * @example
 * ```typescript
 * const core = new AgentCore();
 * const response = await core.run(
 *   { userPrompt: { text: 'Hello' } },
 *   { conversationId: 'conv-123' }
 * );
 * ```
 */
export class AgentCore {
  /**
   * Run the agent with the given input and context
   *
   * This method:
   * 1. Validates the input
   * 2. Registers available tools
   * 3. Calls the AI model
   * 4. Streams the response
   * 5. Persists the conversation
   *
   * @param input - The agent input containing user prompt and optional history
   * @param context - Tool context with conversation ID and approval handler
   * @param options - Optional configuration for the run
   * @returns Promise resolving to the final response content
   * @throws {ValidationError} If input validation fails
   * @throws {ModelError} If model call fails
   * @throws {DatabaseError} If database operations fail
   */
  async run({ input, options, context }: RunParams): Promise<string> {
    // Validate input
    const validationResult = validate(AgentInputSchema, input);
    if (!validationResult.success) {
      throw new ValidationError('Invalid agent input', {
        input: validationResult.errors.map((e) => e.message).join(', '),
      });
    }

    const { tools = [], onDelta, maxTurns = MAX_TURNS, responseFormat, temperature } = options;

    const { conversationId } = context;

    const body: XOAIRequestBody = {
      model: 'mimo-v2.5',
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

    // try {
    //   const modelResult = await callModel(input, sdkTools, {
    //     temperature,
    //     responseFormat,
    //     maxTurns,
    //     sdkContext,
    //     onTurnEnd: async (_ctx: TurnContext, response: OpenResponsesResult) => {
    //       // Save assistant turns that include tool calls to DB
    //       let assistantText = '';
    //       const toolCalls: Array<{
    //         callId: string;
    //         toolName: string;
    //         arguments: string;
    //       }> = [];

    //       for (const item of response.output) {
    //         if (item.type === 'message') {
    //           for (const c of item.content) {
    //             if ('text' in c) {
    //               assistantText += c.text;
    //             }
    //           }
    //         } else if (item.type === 'function_call') {
    //           toolCalls.push({
    //             callId: item.callId,
    //             toolName: item.name,
    //             arguments: item.arguments,
    //           });
    //         }
    //       }

    //       if (toolCalls.length > 0) {
    //         onDelta?.({
    //           type: 'router_decision',
    //           toolNames: toolCalls.map((tc) => tc.toolName),
    //         });
    //         if (conversationId) {
    //           appendMessage({
    //             conversationId,
    //             role: 'assistant',
    //             content: assistantText,
    //             toolCallsJson: JSON.stringify(toolCalls),
    //           });
    //         }
    //       }
    //     },
    //   });

    //   let finalContent = '';
    //   let finalReasoning = '';

    //   try {
    //     if (isResponsesModelResult(modelResult.result)) {
    //       for await (const event of modelResult.result.getFullResponsesStream()) {
    //         if (event.type === 'response.output_text.delta') {
    //           finalContent += event.delta;
    //           onDelta?.({ type: 'content', text: event.delta });
    //         } else if (
    //           event.type === 'response.reasoning_text.delta' ||
    //           event.type === 'response.reasoning_summary_text.delta'
    //         ) {
    //           finalReasoning += event.delta;
    //           // Only display reasoning before content starts to avoid interleaved flickering
    //           if (!finalContent) {
    //             onDelta?.({ type: 'reasoning', text: event.delta });
    //           }
    //         }
    //       }
    //     } else {
    //       for await (const chunk of modelResult.result) {
    //         const choice = chunk.choices[0];
    //         const delta = choice?.delta;
    //         if (!delta) {
    //           continue;
    //         }

    //         if (delta.content) {
    //           finalContent += delta.content;
    //           onDelta?.({ type: 'content', text: delta.content });
    //         }

    //         if (delta.reasoning) {
    //           finalReasoning += delta.reasoning;
    //           if (!finalContent) {
    //             onDelta?.({ type: 'reasoning', text: delta.reasoning });
    //           }
    //         }
    //       }
    //     }
    //   } catch (err) {
    //     const msg = err instanceof Error ? err.message : String(err);
    //     logger.error('Model call failed', { error: msg });
    //     finalContent = `Error: ${msg}`;
    //     onDelta?.({ type: 'content', text: finalContent });
    //   }

    //   onDelta?.({ type: 'done' });

    //   if (conversationId) {
    //     appendMessage({
    //       conversationId,
    //       role: 'assistant',
    //       content: finalContent,
    //       reasoningContent: finalReasoning || undefined,
    //     });
    //   }

    //   return finalContent;
    // } catch (error) {
    //   const appError = ErrorHandler.handle(error, {
    //     conversationId,
    //     operation: 'agent.run',
    //   });

    //   if (appError instanceof ModelError) {
    //     onDelta?.({ type: 'content', text: `Model error: ${appError.message}` });
    //   }

    //   throw appError;
    // }
  }
}

export const agentCore = new AgentCore();
