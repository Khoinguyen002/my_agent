const isDev = process.env['NODE_ENV'] !== 'production';

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    if (isDev) console.error(`[${timestamp()}] INFO  ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.error(`[${timestamp()}] WARN  ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[${timestamp()}] ERROR ${msg}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env['DEBUG']) console.error(`[${timestamp()}] DEBUG ${msg}`, ...args);
  },
};
