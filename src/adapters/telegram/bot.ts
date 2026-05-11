import { Bot } from 'grammy';
import { registerHandlers } from './handlers.js';
import { logger } from '../../utils/logger.js';

let telegramBot: Bot | null = null;

export function createTelegramBot(token: string): Bot {
  telegramBot = new Bot(token);
  registerHandlers(telegramBot);

  telegramBot.catch((err) => {
    logger.error('Telegram bot error', err);
  });

  return telegramBot;
}

export async function startTelegramBot(bot: Bot): Promise<void> {
  logger.info('Starting Telegram bot (polling)...');
  await bot.start({
    onStart: (info) => logger.info(`Telegram bot @${info.username} started`),
  });
}

export function getTelegramBot(): Bot | null {
  return telegramBot;
}
