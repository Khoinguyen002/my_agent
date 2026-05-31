import { Conversation, ConvRow, Message, MsgRow, ToolCall, ToolCallRow } from '../types/conversation/index.js';

export function rowToConversation(row: ConvRow): Conversation {
  return {
    id: row.id,
    botId: row.bot_id ?? undefined,
    source: row.source as Conversation['source'],
    createdAt: row.created_at,
  };
}

export function rowToMessage(row: MsgRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    teleChatId: row.tele_chat_id ?? undefined,
    message: row.message,
    type: row.type as Message['type'],
    imageUrl: row.image_url ?? undefined,
    caption: row.caption ?? undefined,
    role: row.role as Message['role'],
    reasoningContent: row.reasoning_content ?? undefined,
    usage: row.usage ? (JSON.parse(row.usage) as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
  };
}

export function rowToToolCall(row: ToolCallRow): ToolCall {
  return {
    id: row.id,
    messageId: row.message_id,
    llmToolCallId: row.llm_tool_call_id,
    arguments: JSON.parse(row.arguments) as Record<string, unknown>,
    name: row.name,
    content: JSON.parse(row.content),
    createdAt: row.created_at,
  };
}
