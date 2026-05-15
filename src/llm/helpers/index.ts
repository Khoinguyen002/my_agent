import {
  ChatAssistantMessage,
  ChatDeveloperMessage,
  ChatSystemMessage,
  ChatUserMessage,
  EasyInputMessage,
  FunctionCallItem,
  FunctionCallOutputItem,
  InputsUnion1,
} from '@openrouter/sdk/models';
import type { ChatMessages } from '@openrouter/sdk/models/chatmessages.js';
import { AgentInput, CallModalPrompts, DbMessage } from '../../types/index.js';

export function dbMessagesToInputUnion1(messages: DbMessage[]) {
  const result: InputsUnion1[] = [];
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

export function dbMessagesToChatMessages(messages: DbMessage[]) {
  const result: ChatMessages[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content });
    }
    if (msg.role === 'assistant' && msg.toolCallsJson) {
      const toolCalls = JSON.parse(msg.toolCallsJson) as Array<{
        callId: string;
        toolName: string;
        arguments: string;
      }>;
      if (msg.content) result.push({ role: 'assistant', content: msg.content });
      for (const tc of toolCalls) {
        result.push({
          role: 'tool',
          content: msg.content,
          toolCallId: tc.callId,
          toolName: tc.toolName,
          toolArgs: JSON.parse(tc.arguments),
        } as ChatMessages);
      }
    }
    if (msg.role === 'assistant') {
      result.push({ role: 'assistant', content: msg.content });
    }
  }
  return result;
}

export function agentInputToInputsUnion1(input: AgentInput): InputsUnion1[] {
  const result: InputsUnion1[] = [];
  const userContent = input.userPrompt;
  const systemPrompt = input.systemPrompt;

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  if (userContent.text) {
    Array.isArray(userContent.text)
      ? userContent.text.forEach((text) => result.push({ role: 'user', content: text }))
      : result.push({ role: 'user', content: userContent.text });
  }
  if (userContent.image) {
    Array.isArray(userContent.image)
      ? userContent.image.forEach((img) => result.push({ role: 'user', content: img }))
      : result.push({ role: 'user', content: userContent.text });
  }

  return result;
}

export function agentInputToChatMessage(input: AgentInput): ChatMessages[] {
  const result: ChatMessages[] = [];
  const userContent = input.userPrompt;
  const systemPrompt = input.systemPrompt;

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  if (userContent.text) {
    Array.isArray(userContent.text)
      ? userContent.text.forEach((text) => result.push({ role: 'user', content: text }))
      : result.push({ role: 'user', content: [{ text: userContent.text, type: 'text' }] });
  }
  if (userContent.image) {
    Array.isArray(userContent.image)
      ? userContent.image.forEach((img) =>
          result.push({
            role: 'user',
            content: [
              { type: 'image_url', imageUrl: { url: img.url } },
              { type: 'text', text: img.caption ?? '' },
            ],
          }),
        )
      : result.push({
          role: 'user',
          content: [
            { type: 'image_url', imageUrl: { url: userContent.image.url } },
            { type: 'text', text: userContent.image.caption ?? '' },
          ],
        });
  }

  return result;
}
