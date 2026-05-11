import { listConversations, getConversation } from '../../db/conversations.js';
import { formatDate, truncate } from '../../utils/format.js';
import type { CronManager } from '../../cron/manager.js';

export interface CommandResult {
  handled: boolean;
  newConversationId?: string;
  exit?: boolean;
}

export async function handleCommand(
  line: string,
  currentConversationId: string | null,
  newConversation: () => string,
  cronManager: CronManager,
  switchConversation: (id: string) => void
): Promise<CommandResult> {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (!cmd?.startsWith('/')) return { handled: false };

  switch (cmd) {
    case '/new': {
      const id = newConversation();
      console.log(`\nStarted new conversation: ${id}\n`);
      return { handled: true, newConversationId: id };
    }

    case '/list': {
      const convs = listConversations('cli');
      if (convs.length === 0) {
        console.log('\nNo conversations yet.\n');
      } else {
        console.log('\nConversations:');
        for (const c of convs) {
          const marker = c.id === currentConversationId ? ' *' : '  ';
          console.log(`${marker}[${c.id.slice(0, 8)}] ${truncate(c.title, 50)} — ${formatDate(c.updatedAt)}`);
        }
        console.log();
      }
      return { handled: true };
    }

    case '/load': {
      const id = parts[1];
      if (!id) { console.log('\nUsage: /load <conversation-id>\n'); return { handled: true }; }
      const conv = getConversation(id) ?? listConversations().find((c) => c.id.startsWith(id));
      if (!conv) { console.log(`\nConversation not found: ${id}\n`); return { handled: true }; }
      switchConversation(conv.id);
      console.log(`\nLoaded: ${conv.title}\n`);
      return { handled: true, newConversationId: conv.id };
    }

    case '/cron': {
      const sub = parts[1]?.toLowerCase();
      switch (sub) {
        case 'list': {
          const jobs = cronManager.list();
          if (jobs.length === 0) { console.log('\nNo cron jobs.\n'); break; }
          console.log('\nCron jobs:');
          for (const j of jobs) {
            const status = j.enabled ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m';
            console.log(`  ${status} [${j.id.slice(0, 8)}] ${j.name} — ${j.schedule}`);
            console.log(`     Prompt: ${truncate(j.prompt, 60)}`);
            if (j.lastRunAt) console.log(`     Last run: ${formatDate(j.lastRunAt)} (${j.lastRunStatus})`);
          }
          console.log();
          break;
        }
        case 'add': {
          const { input } = await import('@inquirer/prompts');
          const name = await input({ message: 'Cron name:' });
          const schedule = await input({ message: 'Schedule (cron expression, e.g. "0 9 * * *"):' });
          const prompt = await input({ message: 'Prompt to run:' });
          const job = await cronManager.create({ name, schedule, prompt, enabled: true });
          console.log(`\nCreated cron job: ${job.id}\n`);
          break;
        }
        case 'delete': {
          const id = parts[2];
          if (!id) { console.log('\nUsage: /cron delete <id>\n'); break; }
          await cronManager.delete(id);
          console.log(`\nDeleted cron job: ${id}\n`);
          break;
        }
        case 'enable': {
          const id = parts[2];
          if (!id) { console.log('\nUsage: /cron enable <id>\n'); break; }
          await cronManager.update(id, { enabled: true });
          console.log(`\nEnabled: ${id}\n`);
          break;
        }
        case 'disable': {
          const id = parts[2];
          if (!id) { console.log('\nUsage: /cron disable <id>\n'); break; }
          await cronManager.update(id, { enabled: false });
          console.log(`\nDisabled: ${id}\n`);
          break;
        }
        case 'trigger': {
          const id = parts[2];
          if (!id) { console.log('\nUsage: /cron trigger <id>\n'); break; }
          console.log(`\nTriggering cron job: ${id}...\n`);
          await cronManager.trigger(id);
          console.log('Done.\n');
          break;
        }
        default:
          console.log('\nCron commands: /cron list | add | delete <id> | enable <id> | disable <id> | trigger <id>\n');
      }
      return { handled: true };
    }

    case '/tools': {
      const { toolRegistry } = await import('../../tools/registry.js');
      const tools = toolRegistry.getAll();
      console.log('\nRegistered tools:');
      for (const t of tools) {
        console.log(`  - ${t.function.name}: ${t.function.description ?? ''}`);
      }
      console.log();
      return { handled: true };
    }

    case '/help': {
      console.log(`
Commands:
  /new              Start a new conversation
  /list             List recent conversations
  /load <id>        Load a conversation (partial ID ok)
  /cron list        List cron jobs
  /cron add         Create a new cron job
  /cron delete <id> Delete a cron job
  /cron enable <id> Enable a cron job
  /cron disable <id>Disable a cron job
  /cron trigger <id>Manually trigger a cron job
  /tools            List available tools
  /exit             Quit
`);
      return { handled: true };
    }

    case '/exit':
    case '/quit':
      return { handled: true, exit: true };

    default:
      console.log(`\nUnknown command: ${cmd}. Type /help for commands.\n`);
      return { handled: true };
  }
}
