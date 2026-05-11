import { tool } from '@openrouter/sdk/lib/tool.js';
import { z } from 'zod/v4';
import type { Bot } from 'grammy';

export function createTelegramSendTool(chatId: number, getBot: () => Bot | null) {
  return tool({
    name: 'telegram_send',
    description: `Send a message to the Telegram chat (chat ID: ${chatId}). Use this to deliver results or notifications.`,
    inputSchema: z.object({
      message: z.string().describe('The message text to send'),
    }),
    execute: async ({ message }) => {
      const bot = getBot();
      if (!bot) throw new Error('Telegram bot not available');
      await bot.api.sendMessage(chatId, message);
      return `Sent to Telegram chat ${chatId}: "${message}"`;
    },
  });
}
