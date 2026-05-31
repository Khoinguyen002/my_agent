export interface ConvRow {
  id: string;
  bot_id: string | null;
  source: string;
  created_at: number;
}

export interface MsgRow {
  id: string;
  conversation_id: string;
  tele_chat_id: number | null;
  message: string;
  type: string;
  image_url: string | null;
  caption: string | null;
  role: string;
  reasoning_content: string | null;
  usage: string | null;
  created_at: number;
}

export interface ToolCallRow {
  id: string;
  message_id: string;
  llm_tool_call_id: string;
  arguments: string;
  name: string;
  content: string;
  created_at: number;
}

export interface Conversation {
  id: string;
  botId?: string;
  source: 'tele';
  createdAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  teleChatId?: number;
  message: string;
  type: 'text' | 'image';
  imageUrl?: string;
  caption?: string;
  role: 'user' | 'assistant' | 'tool';
  reasoningContent?: string;
  usage?: Record<string, unknown>;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  messageId: string;
  llmToolCallId: string;
  arguments: Record<string, unknown>;
  name: string;
  content: unknown;
  createdAt: number;
}
