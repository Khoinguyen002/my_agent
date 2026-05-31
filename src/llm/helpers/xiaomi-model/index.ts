import { buildBaseSystemPrompt } from '../../../prompts/llm/xiaomi-model.js';
import { AgentInput } from '../../../types/index.js';
import { XOAIDeveloperMessage, XOAIMessage } from '../../types/xiaomi-model/request-body.js';
import { XOAIChatCompletionChunk } from '../../types/xiaomi-model/response.js';

export function buildMessages(input: AgentInput): XOAIMessage[] {
  const msgs: XOAIMessage[] = [{ role: 'system', content: buildBaseSystemPrompt() }];

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
          content: msg.content,
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
          role: msg.role as XOAIDeveloperMessage['role'],
          content: msg.content,
        });
      }
    }
  }

  const { text, image } = input.userPrompt;

  if (text) {
    const content = Array.isArray(text) ? text.join('\n') : text;
    msgs.push({ role: 'user', content });
  }

  if (image) {
    const images = Array.isArray(image) ? image : [image];
    for (const img of images) {
      msgs.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: img.url } },
          { type: 'text', text: img.caption ?? '' },
        ],
      });
    }
  }

  return msgs;
}

// ---------------------------------------------------------------------------
// SSE parser: ReadableStream → AsyncGenerator<XOAIChunk>
// ---------------------------------------------------------------------------

export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<XOAIChatCompletionChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          return;
        }

        try {
          yield JSON.parse(data) as XOAIChatCompletionChunk;
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
