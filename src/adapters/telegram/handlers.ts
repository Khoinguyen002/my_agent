import type { Bot } from 'grammy';
import { agentCore } from '../../agent/core.js';
import { runTelegramOnboarding } from '../../agent/onboarding.js';
import { createConversation, listConversations } from '../../db/conversations.js';
import { createApprovalRequester, registerApprovalListener } from './permissions.js';
import { logger } from '../../utils/logger.js';

// Pending onboarding waiters: chatId → resolver
const onboardingWaiters = new Map<number, (text: string) => void>();

// Track active conversation per Telegram chat
const chatConversations = new Map<number, string>();

function getOrCreateConversation(chatId: number): string {
  let convId = chatConversations.get(chatId);
  if (!convId) {
    const existing = listConversations('telegram').find((c) => c.telegramChatId === chatId);
    if (existing) {
      convId = existing.id;
    } else {
      const conv = createConversation({ source: 'telegram', telegramChatId: chatId });
      convId = conv.id;
    }
    chatConversations.set(chatId, convId);
  }
  return convId;
}

export function registerHandlers(bot: Bot): void {
  // Approval listener must be first so it can intercept yes/no replies
  registerApprovalListener(bot);

  bot.command('start', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const sendMessage = async (text: string) => { await ctx.reply(text); };
    const waitForReply = (): Promise<string> =>
      new Promise((resolve) => { onboardingWaiters.set(chatId, resolve); });

    await runTelegramOnboarding(chatId, sendMessage, waitForReply);
  });

  bot.command('new', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const conv = createConversation({ source: 'telegram', telegramChatId: chatId });
    chatConversations.set(chatId, conv.id);
    await ctx.reply('Started a new conversation.');
  });

  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;
    if (!chatId || !text) return;

    // Skip commands handled elsewhere
    if (text.startsWith('/')) return;

    // Unblock pending onboarding waiter
    const waiter = onboardingWaiters.get(chatId);
    if (waiter) {
      onboardingWaiters.delete(chatId);
      waiter(text);
      return;
    }

    await ctx.replyWithChatAction('typing');

    const conversationId = getOrCreateConversation(chatId);
    const sendMessage = async (msg: string) => { await ctx.reply(msg); };
    const requestApproval = createApprovalRequester(chatId, sendMessage);

    const context = {
      conversationId,
      source: 'telegram' as const,
      telegramChatId: chatId,
      requestApproval,
    };

    try {
      const response = await agentCore.run(text, conversationId, context);
      if (response.trim()) {
        await ctx.reply(response, { parse_mode: 'Markdown' }).catch(() =>
          ctx.reply(response) // fallback without markdown if parse fails
        );
      }
    } catch (err) {
      logger.error('Telegram handler error', err);
      await ctx.reply('Sorry, an error occurred. Please try again.');
    }
  });
}
