import { TurnContext } from '@openrouter/sdk/lib/tool-types.js';
import {
  ChatAssistantMessage,
  ChatDeveloperMessage,
  ChatMessages,
  ChatSystemMessage,
  ChatUserMessage,
  InputsUnion1,
  OpenResponsesResult,
  ResponseFormat,
} from '@openrouter/sdk/models';

export interface Message {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
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
  lastRunStatus?: 'success' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface ToolContext {
  conversationId?: string;
  requestApproval: (description: string) => Promise<boolean>;
}

export type CallModalPrompts = {
  system?: ChatSystemMessage['content'];
  user?: ChatUserMessage['content'];
  developer?: ChatDeveloperMessage['content'];
  assistant?: ChatAssistantMessage['content'];
};

export interface StreamDelta {
  type:
    | 'reasoning'
    | 'content'
    | 'tool_call_delta'
    | 'done'
    | 'router_decision'
    | 'tool_start'
    | 'tool_end'
    | 'tool_skipped';
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

export type DbMessage = {
  role: string;
  content: string;
  toolCallsJson?: string | null;
  toolCallId?: string | null;
};

export type AgentContentPart = { type: 'text'; text: string } | { type: 'image_url'; url: string };
type AgentImageInput = { caption?: string; url: string };
export type AgentInput = {
  userPrompt: { text?: string | string[]; image?: AgentImageInput | AgentImageInput[] };
  systemPrompt?: string;
  history?: DbMessage[];
};

export type CallModelOptions = {
  maxTurns?: number;
  onTurnEnd?: (ctx: TurnContext, response: OpenResponsesResult) => void | Promise<void>;
  /** Per-tool context data injected via contextSchema (e.g. { cron_create: { telegramChatId: 123 } }) */
  sdkContext?: Record<string, Record<string, unknown>>;
  responseFormat?: ResponseFormat;
  temperature?: number;
};
