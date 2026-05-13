import { Bot } from "grammy";
import { env } from "../../../config/env.js";

export async function getTelegramFileUrl(bot: Bot, fileId: string): Promise<string> {
  const file = await bot.api.getFile(fileId);
  return `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`;
}
