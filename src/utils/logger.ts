import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';

const isDev = process.env['NODE_ENV'] !== 'production';
const logDir = join(process.cwd(), 'data', 'logs');
const retentionDays = 5;
let lastCleanupDay = '';

function timestamp(): string {
  return new Date().toISOString();
}

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function currentLogFilePath(now = new Date()): string {
  return join(logDir, `${todayKey(now)}.log`);
}

function ensureLogDir(): void {
  mkdirSync(logDir, { recursive: true });
}

function cleanupOldLogs(now = new Date()): void {
  const currentDay = todayKey(now);
  if (lastCleanupDay === currentDay) return;
  lastCleanupDay = currentDay;

  try {
    ensureLogDir();
    const files = readdirSync(logDir);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays);
    cutoff.setHours(0, 0, 0, 0);

    for (const fileName of files) {
      const match = fileName.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
      if (!match) continue;

      const fileDate = new Date(`${match[1]}T00:00:00.000Z`);
      if (Number.isNaN(fileDate.getTime()) || fileDate >= cutoff) continue;

      unlinkSync(join(logDir, fileName));
    }
  } catch {
    // Logging must never crash the app.
  }
}

function writeToFile(level: string, msg: string, args: unknown[]): void {
  try {
    const now = new Date();
    ensureLogDir();
    cleanupOldLogs(now);
    const line = `[${timestamp()}] ${level.padEnd(5)} ${format(msg, ...args)}`;
    appendFileSync(currentLogFilePath(now), `${line}\n`);
  } catch {
    // Logging must never crash the app.
  }
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    writeToFile('INFO', msg, args);
    if (isDev) console.error(`[${timestamp()}] INFO  ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    writeToFile('WARN', msg, args);
    console.error(`[${timestamp()}] WARN  ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    writeToFile('ERROR', msg, args);
    console.error(`[${timestamp()}] ERROR ${msg}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    writeToFile('DEBUG', msg, args);
    if (process.env['DEBUG']) console.error(`[${timestamp()}] DEBUG ${msg}`, ...args);
  },
};
