import { v4 as uuidv4 } from 'uuid';
import { db } from './client.js';
import type { Conversation, Message } from '../types/index.js';

interface ConvRow {
  id: string;
  title: string;
  source: string;
  telegram_chat_id: number | null;
  cron_job_id: string | null;
  created_at: number;
  updated_at: number;
}

interface MsgRow {
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

function rowToConversation(row: ConvRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    source: row.source as Conversation['source'],
    telegramChatId: row.telegram_chat_id ?? undefined,
    cronJobId: row.cron_job_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MsgRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as Message['role'],
    content: row.content,
    toolCallId: row.tool_call_id ?? undefined,
    toolName: row.tool_name ?? undefined,
    toolCallsJson: row.tool_calls_json ?? undefined,
    reasoningContent: row.reasoning_content ?? undefined,
    createdAt: row.created_at,
  };
}

export function createConversation(opts: {
  title?: string;
  source: Conversation['source'];
  telegramChatId?: number;
  cronJobId?: string;
}): Conversation {
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
  db.prepare(`
    INSERT INTO conversations(id, title, source, telegram_chat_id, cron_job_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(conv.id, conv.title, conv.source, conv.telegramChatId ?? null, conv.cronJobId ?? null, now, now);
  return conv;
}

export function getConversation(id: string): Conversation | undefined {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConvRow | undefined;
  return row ? rowToConversation(row) : undefined;
}

export function listConversations(source?: Conversation['source'], limit = 20): Conversation[] {
  const rows = source
    ? (db.prepare('SELECT * FROM conversations WHERE source = ? ORDER BY updated_at DESC LIMIT ?').all(source, limit) as ConvRow[])
    : (db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?').all(limit) as ConvRow[]);
  return rows.map(rowToConversation);
}

export function updateConversationTitle(id: string, title: string): void {
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
}

export function touchConversation(id: string): void {
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function appendMessage(msg: Omit<Message, 'id' | 'createdAt'>): Message {
  const full: Message = { ...msg, id: uuidv4(), createdAt: Date.now() };
  db.prepare(`
    INSERT INTO messages(id, conversation_id, role, content, tool_call_id, tool_name, tool_calls_json, reasoning_content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    full.id, full.conversationId, full.role, full.content,
    full.toolCallId ?? null, full.toolName ?? null,
    full.toolCallsJson ?? null, full.reasoningContent ?? null,
    full.createdAt
  );
  touchConversation(full.conversationId);
  return full;
}

export function getMessages(conversationId: string): Message[] {
  const rows = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as MsgRow[];
  return rows.map(rowToMessage);
}
