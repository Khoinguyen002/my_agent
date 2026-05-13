export interface ConvRow {
  id: string;
  title: string;
  source: string;
  telegram_chat_id: number | null;
  cron_job_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface MsgRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_calls_json: string | null;
  reasoning_content: string | null;
  created_at: number;
}

export interface Conversation {
  id: string;
  title: string;
  source: "cli" | "telegram" | "cron";
  telegramChatId?: number;
  cronJobId?: string;
  createdAt: number;
  updatedAt: number;
}
