import { v4 as uuidv4 } from 'uuid';
import { db } from './client.js';
import { ToolCall, ToolCallRow } from './types/conversation/index.js';
import { rowToToolCall } from './utils/conversation.js';
import { ErrorHandler, DatabaseError } from '../errors/index.js';

export function createToolCall(
  tc: Omit<ToolCall, 'id' | 'createdAt'>,
): ToolCall {
  try {
    const full: ToolCall = { ...tc, id: uuidv4(), createdAt: Date.now() };
    db.prepare(
      `INSERT INTO tool_call(id, message_id, llm_tool_call_id, arguments, name, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      full.id,
      full.messageId,
      full.llmToolCallId,
      JSON.stringify(full.arguments),
      full.name,
      JSON.stringify(full.content),
      full.createdAt,
    );
    return full;
  } catch (error) {
    const appError = ErrorHandler.handle(error, {
      operation: 'createToolCall',
      messageId: tc.messageId,
    });
    throw new DatabaseError(appError.message, 'INSERT INTO tool_call');
  }
}

export function getToolCallsByMessageId(messageId: string): ToolCall[] {
  try {
    const rows = db
      .prepare('SELECT * FROM tool_call WHERE message_id = ? ORDER BY created_at ASC')
      .all(messageId) as ToolCallRow[];
    return rows.map(rowToToolCall);
  } catch (error) {
    const appError = ErrorHandler.handle(error, { operation: 'getToolCallsByMessageId', messageId });
    throw new DatabaseError(appError.message, 'SELECT * FROM tool_call');
  }
}
