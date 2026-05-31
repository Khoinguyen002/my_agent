import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';

const dataDir = path.resolve(env.dataDir);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'agent.db');
export const db: DatabaseType = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversation (
    id TEXT PRIMARY KEY,
    bot_id TEXT,
    source TEXT NOT NULL CHECK(source IN ('tele')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversation(id),
    tele_chat_id INTEGER,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('text','image')),
    image_url TEXT,
    caption TEXT,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
    reasoning_content TEXT,
    usage TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tool_call (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES message(id),
    llm_tool_call_id TEXT NOT NULL,
    arguments TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profile (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('tele')),
    source_id TEXT NOT NULL,
    expectations TEXT,
    onboarded_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(source, source_id)
  );

  CREATE INDEX IF NOT EXISTS idx_message_conv ON message(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_tool_call_msg ON tool_call(message_id);
`);
