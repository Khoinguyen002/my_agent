import type { Bot } from 'grammy';

const TIMEOUT_MS = 60_000;

// Pending approvals: chatId → resolver
const pendingApprovals = new Map<number, (answer: string) => void>();

export function registerApprovalListener(bot: Bot): void {
  bot.on('message:text', (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return next();
    const resolver = pendingApprovals.get(chatId);
    if (resolver) {
      const text = ctx.message?.text ?? '';
      // Only consume if it looks like a yes/no answer
      if (/^(yes|no|y|n)$/i.test(text.trim())) {
        pendingApprovals.delete(chatId);
        resolver(text.trim().toLowerCase());
        return; // don't pass to other handlers
      }
    }
    return next();
  });
}

export function createApprovalRequester(
  chatId: number,
  sendMessage: (text: string) => Promise<void>,
): (description: string) => Promise<boolean> {
  return (description: string) => {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        pendingApprovals.delete(chatId);
        void sendMessage('Permission request timed out — action denied.');
        resolve(false);
      }, TIMEOUT_MS);

      pendingApprovals.set(chatId, (answer) => {
        clearTimeout(timer);
        resolve(answer === 'yes' || answer === 'y');
      });

      void sendMessage(
        `⚠️ Permission needed:\n${description}\n\nReply \`yes\` to allow or \`no\` to deny.`,
      );
    });
  };
}
