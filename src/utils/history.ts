import type { Message } from "../types/index.js";

export function truncateMessages(messages: Message[], limit: number): Message[] {
  return messages.length > limit ? messages.slice(-limit) : messages;
}
