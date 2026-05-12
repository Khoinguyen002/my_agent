import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';

const dataDir = path.resolve(env.dataDir);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'agent.db');
export const db: DatabaseType = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrate: add media_urls column if it doesn't exist yet
try {
  db.exec('ALTER TABLE messages ADD COLUMN media_urls TEXT');
} catch {
  // Column already exists — safe to ignore
}

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('cli','telegram','cron')),
    telegram_chat_id INTEGER,
    cron_job_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
    content TEXT NOT NULL,
    media_urls TEXT,
    tool_call_id TEXT,
    tool_name TEXT,
    tool_calls_json TEXT,
    reasoning_content TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('cli','telegram')),
    source_id TEXT NOT NULL,
    expectations TEXT,
    onboarded_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(source, source_id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conv_source ON conversations(source, created_at);
`);
