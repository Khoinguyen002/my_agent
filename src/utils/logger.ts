import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';

const isDev = process.env['NODE_ENV'] !== 'production';
const logDir = join(process.cwd(), 'data', 'logs');
const retentionDays = 5;
let lastCleanupDay = '';

/**
 * Log entry structure for structured logging
 */
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

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
  if (lastCleanupDay === currentDay) {
    return;
  }
  lastCleanupDay = currentDay;

  try {
    ensureLogDir();
    const files = readdirSync(logDir);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays);
    cutoff.setHours(0, 0, 0, 0);

    for (const fileName of files) {
      const match = fileName.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
      if (!match) {
        continue;
      }

      const fileDate = new Date(`${match[1]}T00:00:00.000Z`);
      if (Number.isNaN(fileDate.getTime()) || fileDate >= cutoff) {
        continue;
      }

      unlinkSync(join(logDir, fileName));
    }
  } catch {
    // Logging must never crash the app.
  }
}

/**
 * Write structured log entry to file
 * @param level - Log level
 * @param msg - Log message
 * @param args - Additional arguments
 * @param context - Optional context object
 */
function writeToFile(
  level: string,
  msg: string,
  args: unknown[],
  context?: Record<string, unknown>,
): void {
  try {
    const now = new Date();
    ensureLogDir();
    cleanupOldLogs(now);

    const entry: LogEntry = {
      timestamp: timestamp(),
      level: level.padEnd(5),
      message: format(msg, ...args),
    };

    if (context) {
      entry.context = context;
    }

    // Check if any argument is an Error
    for (const arg of args) {
      if (arg instanceof Error) {
        entry.error = {
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        };
        break;
      }
    }

    const line = JSON.stringify(entry);
    appendFileSync(currentLogFilePath(now), `${line}\n`);
  } catch {
    // Logging must never crash the app.
  }
}

/**
 * Logger with structured logging capabilities
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * logger.info('User created', { userId: '123', email: 'user@example.com' });
 * logger.error('Operation failed', { operation: 'createUser' }, error);
 * ```
 */
export const logger = {
  /**
   * Log info message
   * @param msg - Log message
   * @param args - Additional arguments
   */
  info: (msg: string, ...args: unknown[]): void => {
    writeToFile('INFO', msg, args);
    if (isDev) {
      console.error(`[${timestamp()}] INFO  ${msg}`, ...args);
    }
  },

  /**
   * Log warning message
   * @param msg - Log message
   * @param args - Additional arguments
   */
  warn: (msg: string, ...args: unknown[]): void => {
    writeToFile('WARN', msg, args);
    console.error(`[${timestamp()}] WARN  ${msg}`, ...args);
  },

  /**
   * Log error message
   * @param msg - Log message
   * @param args - Additional arguments (can include Error objects)
   */
  error: (msg: string, ...args: unknown[]): void => {
    writeToFile('ERROR', msg, args);
    console.error(`[${timestamp()}] ERROR ${msg}`, ...args);
  },

  /**
   * Log debug message (only in development or when DEBUG env is set)
   * @param msg - Log message
   * @param args - Additional arguments
   */
  debug: (msg: string, ...args: unknown[]): void => {
    writeToFile('DEBUG', msg, args);
    if (process.env['DEBUG']) {
      console.error(`[${timestamp()}] DEBUG ${msg}`, ...args);
    }
  },

  /**
   * Log with custom context
   * @param level - Log level
   * @param msg - Log message
   * @param context - Context object
   * @param args - Additional arguments
   */
  logWithContext: (
    level: 'info' | 'warn' | 'error' | 'debug',
    msg: string,
    context: Record<string, unknown>,
    ...args: unknown[]
  ): void => {
    writeToFile(level.toUpperCase(), msg, args, context);
    if (level === 'debug' && !process.env['DEBUG']) {
      return;
    }
    console.error(`[${timestamp()}] ${level.toUpperCase().padEnd(5)} ${msg}`, context, ...args);
  },

  /**
   * Create a child logger with fixed context
   * @param context - Fixed context for all log messages
   * @returns Logger with fixed context
   */
  child: (
    context: Record<string, unknown>,
  ): {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    debug: (msg: string, ...args: unknown[]) => void;
  } => ({
    info: (msg: string, ...args: unknown[]): void => {
      logger.logWithContext('info', msg, context, ...args);
    },
    warn: (msg: string, ...args: unknown[]): void => {
      logger.logWithContext('warn', msg, context, ...args);
    },
    error: (msg: string, ...args: unknown[]): void => {
      logger.logWithContext('error', msg, context, ...args);
    },
    debug: (msg: string, ...args: unknown[]): void => {
      logger.logWithContext('debug', msg, context, ...args);
    },
  }),
};
