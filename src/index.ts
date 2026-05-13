import './config/env.js'; // loads .env and validates
import { env } from './config/env.js';

// DB must be initialized before anything that uses it
import './db/client.js';

import { registerBuiltinTools } from './tools/implementations/index.js';
import { toolRegistry } from './tools/registry.js';
import { cronCreateTool, cronDeleteTool, cronListTool } from './tools/implementations/cron-manager.js';
import { cronManager } from './cron/manager.js';
import { createTelegramBot, startTelegramBot } from './adapters/telegram/bot.js';
import { startApiServer } from './adapters/api/server.js';
import { runCliOnboarding } from './agent/onboarding.js';
import { startRepl } from './adapters/cli/repl.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const withTelegram = args.includes('--telegram') || Boolean(env.telegramBotToken);
  const cronOnly = args.includes('--cron-only');
  const withApi = args.includes('--api') || env.apiPort > 0;
  const isTTY = process.stdin.isTTY;
  const runCli = !cronOnly && isTTY;

  // Register tools
  registerBuiltinTools();

  // Init cron system
  cronManager.initialize();

  // Register cron tools (after cronManager is ready)
  toolRegistry.register(cronCreateTool);
  toolRegistry.register(cronListTool);
  toolRegistry.register(cronDeleteTool);

  logger.info('Tools registered:', toolRegistry.list());

  // Graceful shutdown
  const shutdown = (): void => {
    cronManager.stopAll();
    logger.info('Shutdown complete.');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (cronOnly) {
    logger.info('Running in cron-only mode. Waiting for scheduled jobs...');
    return; // event loop keeps running due to node-cron
  }

  // Run CLI onboarding BEFORE starting Telegram so its logs don't pollute the prompt
  if (runCli) {
    await runCliOnboarding();
  }

  // Start Telegram after onboarding is complete
  if (withTelegram && env.telegramBotToken) {
    const bot = createTelegramBot(env.telegramBotToken);
    void startTelegramBot(bot).catch((err) => logger.error('Telegram bot crashed', err));
  }

  if (withApi) {
    void startApiServer().catch((err) => logger.error('API server crashed', err));
  }

  if (runCli) {
    await startRepl(cronManager);
  } else if (!withTelegram) {
    logger.warn('No interactive TTY and no Telegram token. Exiting.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
