import { Conversation, ConvRow, MsgRow } from "../types/conversation/index.js";
import { Message } from "../../types/index.js";

export function rowToConversation(row: ConvRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    source: row.source as Conversation["source"],
    telegramChatId: row.telegram_chat_id ?? undefined,
    cronJobId: row.cron_job_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMessage(row: MsgRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as Message["role"],
    content: row.content,
    toolCallId: row.tool_call_id ?? undefined,
    toolName: row.tool_name ?? undefined,
    toolCallsJson: row.tool_calls_json ?? undefined,
    reasoningContent: row.reasoning_content ?? undefined,
    createdAt: row.created_at,
  };
}