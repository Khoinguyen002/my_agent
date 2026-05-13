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
  conversationId: string;
  requestApproval: (description: string) => Promise<boolean>;
}

export type AgentContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      url: string;
    };

export type AgentInput = {
  parts: AgentContentPart[];
};

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
