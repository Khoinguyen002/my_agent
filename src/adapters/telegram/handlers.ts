import type { Bot } from 'grammy';
import { agentCore } from '../../agent/core.js';
import { runTelegramOnboarding } from '../../agent/onboarding.js';
import { createConversation, listConversations } from '../../db/conversations.js';
import { createApprovalRequester, registerApprovalListener } from './permissions.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

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

async function getTelegramFileUrl(bot: Bot, fileId: string): Promise<string> {
  const file = await bot.api.getFile(fileId);
  return `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`;
}

async function runAgentWithMedia(
  bot: Bot,
  chatId: number,
  text: string,
  mediaUrls: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
): Promise<void> {
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
    const response = await agentCore.run(text, conversationId, context, undefined, undefined, mediaUrls);
    if (response.trim()) {
      await ctx.reply(response, { parse_mode: 'Markdown' }).catch(() => ctx.reply(response));
    }
  } catch (err) {
    logger.error('Telegram media handler error', err);
    await ctx.reply('Sorry, an error occurred. Please try again.');
  }
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

  // Handle photo messages (single or multiple photos in a media group arrive as separate updates)
  bot.on('message:photo', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Unblock pending onboarding waiter if present
    const waiter = onboardingWaiters.get(chatId);
    if (waiter) {
      onboardingWaiters.delete(chatId);
      waiter(ctx.message.caption ?? '');
      return;
    }

    try {
      // Telegram sends an array of PhotoSize for each photo; pick the highest-res one
      const photos = ctx.message.photo;
      const bestPhoto = photos[photos.length - 1];
      const fileUrl = await getTelegramFileUrl(bot, bestPhoto.file_id);
      const caption = ctx.message.caption ?? '';
      await runAgentWithMedia(bot, chatId, caption, [fileUrl], ctx);
    } catch (err) {
      logger.error('Telegram photo handler error', err);
      await ctx.reply('Sorry, failed to process the image. Please try again.');
    }
  });

  // Handle image files sent as documents (uncompressed uploads)
  bot.on('message:document', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const doc = ctx.message.document;
    const mimeType = doc.mime_type ?? '';
    if (!mimeType.startsWith('image/')) return; // only handle image documents

    try {
      const fileUrl = await getTelegramFileUrl(bot, doc.file_id);
      const caption = ctx.message.caption ?? '';
      await runAgentWithMedia(bot, chatId, caption, [fileUrl], ctx);
    } catch (err) {
      logger.error('Telegram document handler error', err);
      await ctx.reply('Sorry, failed to process the image file. Please try again.');
    }
  });
}
