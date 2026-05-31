import { v4 as uuidv4 } from 'uuid';
import { db } from './client.js';
import { Conversation, ConvRow, MsgRow } from './types/conversation/index.js';
import { Message } from '../types/index.js';
import { rowToConversation, rowToMessage } from './utils/conversation.js';
import { ErrorHandler, DatabaseError } from '../errors/index.js';

/**
 * Create a new conversation
 * @param opts - Conversation options
 * @returns Created conversation
 * @throws {DatabaseError} If conversation creation fails
 */
export function createConversation(opts: {
  title?: string;
  source: Conversation['source'];
  telegramChatId?: number;
  cronJobId?: string;
}): Conversation {
  try {
    const now = Date.now();
    const conv: Conversation = {
      id: uuidv4(),
      title: opts.title ?? 'New conversation',
      source: opts.source,
      telegramChatId: opts.telegramChatId,
      cronJobId: opts.cronJobId,
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(
      `
      INSERT INTO conversations(id, title, source, telegram_chat_id, cron_job_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      conv.id,
      conv.title,
      conv.source,
      conv.telegramChatId ?? null,
      conv.cronJobId ?? null,
      now,
      now,
    );
    return conv;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'createConversation',
      source: opts.source,
    });
    throw new DatabaseError(appError.message, 'INSERT INTO conversations');
  }
}

/**
 * Get a conversation by ID
 * @param id - Conversation ID
 * @returns Conversation or undefined if not found
 * @throws {DatabaseError} If query fails
 */
export function getConversation(id: string): Conversation | undefined {
  try {
    const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | ConvRow
      | undefined;
    return row ? rowToConversation(row) : undefined;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'getConversation',
      conversationId: id,
    });
    throw new DatabaseError(appError.message, 'SELECT * FROM conversations');
  }
}

/**
 * Get a conversation by Telegram chat ID
 * @param chatId - Telegram chat ID
 * @returns Conversation or undefined if not found
 * @throws {DatabaseError} If query fails
 */
export function getConversationByTelegramChatId(chatId: number): Conversation | undefined {
  try {
    const row = db
      .prepare(
        'SELECT * FROM conversations WHERE telegram_chat_id = ? ORDER BY updated_at DESC LIMIT 1',
      )
      .get(chatId) as ConvRow | undefined;
    return row ? rowToConversation(row) : undefined;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'getConversationByTelegramChatId',
      chatId,
    });
    throw new DatabaseError(appError.message, 'SELECT * FROM conversations');
  }
}

/**
 * List conversations with optional source filter and pagination
 * @param source - Optional source filter
 * @param options - Pagination options
 * @param options.limit - Maximum number of conversations to return (default: 20)
 * @param options.offset - Number of conversations to skip (default: 0)
 * @returns Array of conversations
 * @throws {DatabaseError} If query fails
 */
export function listConversations(
  source?: Conversation['source'],
  options: { limit?: number; offset?: number } = {},
): Conversation[] {
  const { limit = 20, offset = 0 } = options;

  try {
    const rows = source
      ? (db
          .prepare(
            'SELECT * FROM conversations WHERE source = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
          )
          .all(source, limit, offset) as ConvRow[])
      : (db
          .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?')
          .all(limit, offset) as ConvRow[]);
    return rows.map(rowToConversation);
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'listConversations',
      source,
      limit,
      offset,
    });
    throw new DatabaseError(appError.message, 'SELECT * FROM conversations');
  }
}

/**
 * Get total conversation count with optional source filter
 * @param source - Optional source filter
 * @returns Total number of conversations
 * @throws {DatabaseError} If query fails
 */
export function getConversationCount(source?: Conversation['source']): number {
  try {
    const query = source
      ? 'SELECT COUNT(*) as count FROM conversations WHERE source = ?'
      : 'SELECT COUNT(*) as count FROM conversations';
    const result = source
      ? (db.prepare(query).get(source) as { count: number })
      : (db.prepare(query).get() as { count: number });
    return result.count;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'getConversationCount',
      source,
    });
    throw new DatabaseError(appError.message, 'SELECT COUNT(*) FROM conversations');
  }
}

/**
 * Update conversation title
 * @param id - Conversation ID
 * @param title - New title
 * @throws {DatabaseError} If update fails
 */
export function updateConversationTitle(id: string, title: string): void {
  try {
    db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(
      title,
      Date.now(),
      id,
    );
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'updateConversationTitle',
      conversationId: id,
    });
    throw new DatabaseError(appError.message, 'UPDATE conversations');
  }
}

/**
 * Update conversation timestamp
 * @param id - Conversation ID
 * @throws {DatabaseError} If update fails
 */
export function touchConversation(id: string): void {
  try {
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id);
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'touchConversation',
      conversationId: id,
    });
    throw new DatabaseError(appError.message, 'UPDATE conversations');
  }
}

/**
 * Append a message to a conversation
 * @param msg - Message to append (without id and createdAt)
 * @returns Created message
 * @throws {DatabaseError} If message creation fails
 */
export function appendMessage(msg: Omit<Message, 'id' | 'createdAt'>): Message {
  try {
    const full: Message = { ...msg, id: uuidv4(), createdAt: Date.now() };

    db.prepare(
      `
      INSERT INTO messages(id, conversation_id, role, content, tool_call_id, tool_name, tool_calls_json, reasoning_content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      full.id,
      full.conversationId,
      full.role,
      full.content,
      full.toolCallId ?? null,
      full.toolName ?? null,
      full.toolCallsJson ?? null,
      full.reasoningContent ?? null,
      full.createdAt,
    );
    touchConversation(full.conversationId);
    return full;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'appendMessage',
      conversationId: msg.conversationId,
      role: msg.role,
    });
    throw new DatabaseError(appError.message, 'INSERT INTO messages');
  }
}

/**
 * Get messages for a conversation with pagination
 * @param conversationId - Conversation ID
 * @param options - Pagination options
 * @param options.limit - Maximum number of messages to return (default: 100)
 * @param options.offset - Number of messages to skip (default: 0)
 * @returns Array of messages
 * @throws {DatabaseError} If query fails
 */
export function getMessages(
  conversationId: string,
  options: { limit?: number; offset?: number } = {},
): Message[] {
  const { limit = 100, offset = 0 } = options;

  try {
    const rows = db
      .prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      )
      .all(conversationId, limit, offset) as MsgRow[];
    return rows.map(rowToMessage);
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'getMessages',
      conversationId,
      limit,
      offset,
    });
    throw new DatabaseError(appError.message, 'SELECT * FROM messages');
  }
}

/**
 * Get total message count for a conversation
 * @param conversationId - Conversation ID
 * @returns Total number of messages
 * @throws {DatabaseError} If query fails
 */
export function getMessageCount(conversationId: string): number {
  try {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?')
      .get(conversationId) as { count: number };
    return result.count;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'getMessageCount',
      conversationId,
    });
    throw new DatabaseError(appError.message, 'SELECT COUNT(*) FROM messages');
  }
}
