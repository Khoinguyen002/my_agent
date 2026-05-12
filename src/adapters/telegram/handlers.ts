import type { Bot } from "grammy";
import { agentCore } from "../../agent/core.js";
import { runTelegramOnboarding } from "../../agent/onboarding.js";
import { env } from "../../config/env.js";
import {
  createConversation,
  listConversations,
} from "../../db/conversations.js";
import { logger } from "../../utils/logger.js";
import {
  createApprovalRequester,
  registerApprovalListener,
} from "./permissions.js";

// Pending onboarding waiters: chatId → resolver
const onboardingWaiters = new Map<number, (text: string) => void>();

// Track active conversation per Telegram chat
const chatConversations = new Map<number, string>();

function getOrCreateConversation(chatId: number): string {
  let convId = chatConversations.get(chatId);
  if (!convId) {
    const existing = listConversations("telegram").find(
      (c) => c.telegramChatId === chatId,
    );
    if (existing) {
      convId = existing.id;
    } else {
      const conv = createConversation({
        source: "telegram",
        telegramChatId: chatId,
      });
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

async function imageToBase64(url: string) {
  try {
    // 1. Fetch dữ liệu từ URL
    const response = await fetch(url);

    // Kiểm tra nếu fetch thành công
    if (!response.ok) throw new Error("Can't convert image to base64");

    // 2. Chuyển đổi phản hồi thành ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // 3. Chuyển ArrayBuffer thành Buffer của Node.js
    const buffer = Buffer.from(arrayBuffer);

    // 4. Chuyển Buffer sang chuỗi Base64
    const base64String = buffer.toString("base64");

    // 5. Lấy kiểu file (MIME type) từ header để tạo chuỗi Data URI hoàn chỉnh
    const mimeType = response.headers.get("content-type");

    return `data:${mimeType};base64,${base64String}`;
  } catch (error) {
    logger.error("Error:", error);
    throw new Error("Can't convert image to base64");
  }
}

export function registerHandlers(bot: Bot): void {
  // Approval listener must be first so it can intercept yes/no replies
  registerApprovalListener(bot);

  bot.command("start", async (ctx) => {
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

  bot.command("new", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const conv = createConversation({
      source: "telegram",
      telegramChatId: chatId,
    });
    chatConversations.set(chatId, conv.id);
    await ctx.reply("Started a new conversation.");
  });

  bot.on("message:photo", async (ctx) => {
    const chatId = ctx.chat?.id;
    const photo = ctx.message?.photo;
    const bestPhoto = photo[photo.length - 1];
    const caption = ctx.message?.caption ?? "";

    await ctx.replyWithChatAction("typing");

    const sendMessage = async (msg: string) => {
      await ctx.reply(msg);
    };
    const conversationId = getOrCreateConversation(chatId);
    const requestApproval = createApprovalRequester(chatId, sendMessage);

    try {
      const response = await agentCore.run(
        {
          caption,
          base64: await imageToBase64(
            await getTelegramFileUrl(bot, bestPhoto.file_id),
          ),
        },
        {
          telegram: { conversationId, telegramChatId: chatId },
          source: "telegram" as const,
          requestApproval,
        },
      );
      if (response.trim()) {
        await ctx.reply(response, { parse_mode: "Markdown" }).catch(
          () => ctx.reply(response), // fallback without markdown if parse fails
        );
      }
    } catch (err) {
      logger.error("Telegram handler error", err);
      await ctx.reply("Sorry, an error occurred. Please try again.");
    }
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;
    if (!chatId || !text) return;

    // Skip commands handled elsewhere
    if (text.startsWith("/")) return;

    // Unblock pending onboarding waiter
    const waiter = onboardingWaiters.get(chatId);
    if (waiter) {
      onboardingWaiters.delete(chatId);
      waiter(text);
      return;
    }

    await ctx.replyWithChatAction("typing");

    const conversationId = getOrCreateConversation(chatId);
    console.log("conversationId", conversationId);
    const sendMessage = async (msg: string) => {
      await ctx.reply(msg);
    };
    const requestApproval = createApprovalRequester(chatId, sendMessage);

    try {
      const response = await agentCore.run(text, {
        telegram: { conversationId, telegramChatId: chatId },
        source: "telegram" as const,
        requestApproval,
      });
      if (response.trim()) {
        await ctx.reply(response, { parse_mode: "Markdown" }).catch(
          () => ctx.reply(response), // fallback without markdown if parse fails
        );
      }
    } catch (err) {
      logger.error("Telegram handler error", err);
      await ctx.reply("Sorry, an error occurred. Please try again.");
    }
  });
}
