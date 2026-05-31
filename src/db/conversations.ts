import { v4 as uuidv4 } from 'uuid';
import { db } from './client.js';
import { Conversation, ConvRow, Message, MsgRow } from './types/conversation/index.js';
import { rowToConversation, rowToMessage } from './utils/conversation.js';
import { ErrorHandler, DatabaseError } from '../errors/index.js';

export function createConversation(opts: { botId?: string }): Conversation {
  try {
    const now = Date.now();
    const conv: Conversation = {
      id: uuidv4(),
      botId: opts.botId,
      source: 'tele',
      createdAt: now,
    };
    db.prepare(
      `INSERT INTO conversation(id, bot_id, source, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(conv.id, conv.botId ?? null, conv.source, now);
    return conv;
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'createConversation' });
    throw new DatabaseError(appError.message, 'INSERT INTO conversation');
  }
}

export function getConversation(id: string): Conversation | undefined {
  try {
    const row = db.prepare('SELECT * FROM conversation WHERE id = ?').get(id) as
      | ConvRow
      | undefined;
    return row ? rowToConversation(row) : undefined;
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'getConversation', conversationId: id });
    throw new DatabaseError(appError.message, 'SELECT * FROM conversation');
  }
}

export function getConversationByTeleChatId(chatId: number): Conversation | undefined {
  try {
    const row = db
      .prepare(
        `SELECT c.* FROM conversation c
         JOIN message m ON m.conversation_id = c.id
         WHERE m.tele_chat_id = ?
         ORDER BY m.created_at DESC LIMIT 1`,
      )
      .get(chatId) as ConvRow | undefined;
    return row ? rowToConversation(row) : undefined;
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'getConversationByTeleChatId', chatId });
    throw new DatabaseError(appError.message, 'SELECT * FROM conversation');
  }
}

export function listConversations(
  options: { limit?: number; offset?: number } = {},
): Conversation[] {
  const { limit = 20, offset = 0 } = options;
  try {
    const rows = db
      .prepare('SELECT * FROM conversation ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as ConvRow[];
    return rows.map(rowToConversation);
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'listConversations', limit, offset });
    throw new DatabaseError(appError.message, 'SELECT * FROM conversation');
  }
}

export function getConversationCount(): number {
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM conversation').get() as {
      count: number;
    };
    return result.count;
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'getConversationCount' });
    throw new DatabaseError(appError.message, 'SELECT COUNT(*) FROM conversation');
  }
}

export function appendMessage(msg: Omit<Message, 'id' | 'createdAt'>): Message {
  try {
    const full: Message = { ...msg, id: uuidv4(), createdAt: Date.now() };
    db.prepare(
      `INSERT INTO message(id, conversation_id, tele_chat_id, message, type, image_url, caption, role, reasoning_content, usage, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      full.id,
      full.conversationId,
      full.teleChatId ?? null,
      full.message,
      full.type,
      full.imageUrl ?? null,
      full.caption ?? null,
      full.role,
      full.reasoningContent ?? null,
      full.usage ? JSON.stringify(full.usage) : null,
      full.createdAt,
    );
    return full;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'appendMessage',
      conversationId: msg.conversationId,
      role: msg.role,
    });
    throw new DatabaseError(appError.message, 'INSERT INTO message');
  }
}

export function getMessages(
  conversationId: string,
  options: { limit?: number; offset?: number } = {},
): Message[] {
  const { limit = 100, offset = 0 } = options;
  try {
    const rows = db
      .prepare(
        'SELECT * FROM message WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      )
      .all(conversationId, limit, offset) as MsgRow[];
    return rows.map(rowToMessage);
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'getMessages', conversationId, limit, offset });
    throw new DatabaseError(appError.message, 'SELECT * FROM message');
  }
}

export function getMessageCount(conversationId: string): number {
  try {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM message WHERE conversation_id = ?')
      .get(conversationId) as { count: number };
    return result.count;
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'getMessageCount', conversationId });
    throw new DatabaseError(appError.message, 'SELECT COUNT(*) FROM message');
  }
}
