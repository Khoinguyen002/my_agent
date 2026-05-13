import { createConversation, getConversation } from '../db/conversations.js';
import { Conversation } from '../db/types/conversation/index.js';

export class AgentSession {
  private _conversationId: string | null = null;

  get conversationId(): string | null {
    return this._conversationId;
  }

  async getOrCreate(source: Conversation['source'], opts?: { telegramChatId?: number; cronJobId?: string }): Promise<string> {
    if (this._conversationId) return this._conversationId;
    const conv = createConversation({ source, ...opts });
    this._conversationId = conv.id;
    return conv.id;
  }

  load(conversationId: string): Conversation {
    const conv = getConversation(conversationId);
    if (!conv) throw new Error(`Conversation not found: ${conversationId}`);
    this._conversationId = conversationId;
    return conv;
  }

  newConversation(source: Conversation['source'], opts?: { telegramChatId?: number }): string {
    const conv = createConversation({ source, ...opts });
    this._conversationId = conv.id;
    return conv.id;
  }
}
