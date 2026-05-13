import type { Bot } from 'grammy';
import { agentCore } from '../../agent/core.js';
import { runTelegramOnboarding } from '../../agent/onboarding.js';
import {
  appendMessage,
  createConversation,
  getConversationByTelegramChatId,
  getMessages,
  updateConversationTitle,
} from '../../db/conversations.js';
import { logger } from '../../utils/logger.js';
import { createApprovalRequester, registerApprovalListener } from './permissions.js';
import { getTelegramFileUrl } from './utils/index.js';
import type { AgentInput } from '../../types/index.js';
import { truncateMessages } from '../../utils/history.js';

// Pending onboarding waiters: chatId → resolver
const onboardingWaiters = new Map<number, (text: string) => void>();

const HISTORY_LIMIT = 20;

export function registerHandlers(bot: Bot): void {
  // Approval listener must be first so it can intercept yes/no replies
  registerApprovalListener(bot);

  bot.command('start', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const sendMessage = async (text: string) => {
      await ctx.reply(text);
    };
    const waitForReply = (): Promise<string> =>
      new Promise((resolve) => {
        onboardingWaiters.set(chatId, resolve);
      });

    await runTelegramOnboarding(chatId, sendMessage, waitForReply);
  });

  bot.command('new', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    createConversation({
      source: 'telegram',
      telegramChatId: chatId,
    });
    await ctx.reply('Started a new conversation.');
  });

  bot.on('message:photo', async (ctx) => {
    const chatId = ctx.chat?.id;
    const photo = ctx.message?.photo;
    const bestPhoto = photo[photo.length - 1];
    const caption = ctx.message?.caption ?? '';

    await ctx.replyWithChatAction('typing');

    const sendMessage = async (msg: string) => {
      await ctx.reply(msg);
    };
    const conversationId =
      getConversationByTelegramChatId(chatId)?.id ??
      createConversation({
        source: 'telegram',
        telegramChatId: chatId,
      }).id;
    const requestApproval = createApprovalRequester(chatId, sendMessage);

    const inputText = caption.trim() || '[image]';
    appendMessage({ conversationId, role: 'user', content: inputText });
    const dbMessages = getMessages(conversationId);
    if (dbMessages.filter((m) => m.role === 'user').length === 1) {
      const title = inputText.slice(0, 60) + (inputText.length > 60 ? '...' : '');
      updateConversationTitle(conversationId, title);
    }
    const history = truncateMessages(dbMessages, HISTORY_LIMIT);

    const parts: AgentInput['parts'] = [];
    if (caption.trim()) {
      parts.push({ type: 'text', text: caption });
    }
    parts.push({
      type: 'image_url',
      url: await getTelegramFileUrl(bot, bestPhoto.file_id),
    });
    const input: AgentInput = { parts };

    try {
      const response = await agentCore.run(input, { conversationId, requestApproval }, { history });
      if (response.trim()) {
        await ctx.reply(response, { parse_mode: 'Markdown' }).catch(
          () => ctx.reply(response), // fallback without markdown if parse fails
        );
      }
    } catch (err) {
      logger.error('Telegram handler error', err);
      await ctx.reply('Sorry, an error occurred. Please try again.');
    }
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

    const conversationId =
      getConversationByTelegramChatId(chatId)?.id ??
      createConversation({
        source: 'telegram',
        telegramChatId: chatId,
      }).id;
    const sendMessage = async (msg: string) => {
      await ctx.reply(msg);
    };
    const requestApproval = createApprovalRequester(chatId, sendMessage);

    appendMessage({ conversationId, role: 'user', content: text });
    const dbMessages = getMessages(conversationId);
    if (dbMessages.filter((m) => m.role === 'user').length === 1) {
      const title = text.slice(0, 60) + (text.length > 60 ? '...' : '');
      updateConversationTitle(conversationId, title);
    }
    const history = truncateMessages(dbMessages, HISTORY_LIMIT);
    const input: AgentInput = { parts: [{ type: 'text', text }] };

    try {
      const response = await agentCore.run(input, { conversationId, requestApproval }, { history });
      if (response.trim()) {
        await ctx.reply(response, { parse_mode: 'Markdown' }).catch(
          () => ctx.reply(response), // fallback without markdown if parse fails
        );
      }
    } catch (err) {
      logger.error('Telegram handler error', err);
      await ctx.reply('Sorry, an error occurred. Please try again.');
    }
  });
}
