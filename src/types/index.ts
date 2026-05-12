export interface Message {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCallsJson?: string;
  reasoningContent?: string;
  createdAt: number;
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

export interface UserProfile {
  id: string;
  name: string;
  source: "cli" | "telegram";
  sourceId: string;
  expectations?: string;
  onboardedAt: number;
  createdAt: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  telegramChatId?: number;
  lastRunAt?: number;
  lastRunStatus?: "success" | "error";
  createdAt: number;
  updatedAt: number;
}

export interface ToolContext {
  telegram: {
    conversationId: string;
    telegramChatId?: number;
  };
  source: "cli" | "telegram" | "cron";
  requestApproval: (description: string) => Promise<boolean>;
}

export type AgentInput =
  | {
      caption: string;
      base64: string;
    }
  | string;

export interface StreamDelta {
  type:
    | "reasoning"
    | "content"
    | "tool_call_delta"
    | "done"
    | "router_decision"
    | "tool_start"
    | "tool_end"
    | "tool_skipped";
  text?: string;
  toolCallIndex?: number;
  // router_decision
  toolNames?: string[];
  // tool_start / tool_end / tool_skipped
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOutput?: string;
  toolSuccess?: boolean;
}
