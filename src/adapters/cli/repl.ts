import readline from "readline";
import { runCliOnboarding, getOrNullProfile } from "../../agent/onboarding.js";
import { agentCore } from "../../agent/core.js";
import { AgentSession } from "../../agent/session.js";
import { TerminalRenderer } from "./renderer.js";
import { handleCommand } from "./commands.js";
import type { CronManager } from "../../cron/manager.js";
import type { AgentInput, ToolContext } from "../../types/index.js";
import {
  appendMessage,
  getMessages,
  updateConversationTitle,
} from "../../db/conversations.js";
import { truncateMessages } from "../../utils/history.js";

const HISTORY_LIMIT = 20;

export async function startRepl(cronManager: CronManager): Promise<void> {
  // Onboarding already ran in index.ts; just fetch the saved profile
  const profile = getOrNullProfile("cli", "cli") ?? (await runCliOnboarding());
  const session = new AgentSession();
  const renderer = new TerminalRenderer();

  console.log(
    `\nHello, ${profile.name}! Type a message or /help for commands.\n`,
  );

  let conversationId = session.newConversation("cli");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[1m> \x1b[0m",
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    rl.pause();

    try {
      const result = await handleCommand(
        trimmed,
        conversationId,
        () => {
          conversationId = session.newConversation("cli");
          return conversationId;
        },
        cronManager,
        (id) => {
          conversationId = id;
        },
      );

      if (result.exit) {
        console.log("\nGoodbye!\n");
        rl.close();
        process.exit(0);
      }

      if (result.handled) {
        if (result.newConversationId) conversationId = result.newConversationId;
        rl.resume();
        rl.prompt();
        return;
      }

      // Build tool context with CLI approval
      const context: ToolContext = {
        conversationId,
        requestApproval: (description) => {
          return new Promise((resolve) => {
            const approvalRl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            approvalRl.question(
              `\n\x1b[33m[Permission needed]\x1b[0m ${description}\nAllow? (y/n): `,
              (answer) => {
                approvalRl.close();
                resolve(answer.toLowerCase().startsWith("y"));
              },
            );
          });
        },
      };

      process.stdout.write("\n");

      appendMessage({ conversationId, role: "user", content: trimmed });
      const dbMessages = getMessages(conversationId);
      if (dbMessages.filter((m) => m.role === "user").length === 1) {
        const title =
          trimmed.slice(0, 60) + (trimmed.length > 60 ? "..." : "");
        updateConversationTitle(conversationId, title);
      }
      const history = truncateMessages(dbMessages, HISTORY_LIMIT);
      const input: AgentInput = { parts: [{ type: "text", text: trimmed }] };

      await agentCore.run(input, context, {
        history,
        onDelta: (delta) => renderer.feed(delta),
      });
      renderer.finish();
    } catch (err) {
      console.error(`\n\x1b[31mError: ${String(err)}\x1b[0m\n`);
    }

    rl.resume();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye!\n");
    process.exit(0);
  });
}
