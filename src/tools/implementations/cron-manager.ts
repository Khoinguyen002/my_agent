import { tool } from '@openrouter/sdk/lib/tool.js';
import { z } from 'zod/v4';
import { cronManager } from '../../cron/manager.js';

export const cronCreateTool = tool({
  name: 'cron_create',
  description: 'Create a new scheduled cron job. The schedule is a standard cron expression (e.g. "0 9 * * *" for 9am daily). The prompt is the task the agent will run on schedule.',
  inputSchema: z.object({
    name: z.string().describe('Human-readable name for the cron job'),
    schedule: z.string().describe('Cron expression, e.g. "0 9 * * *" for 9am daily, "*/30 * * * *" for every 30 minutes'),
    prompt: z.string().describe('The prompt/task to run when the cron fires'),
  }),
  contextSchema: z.object({ telegramChatId: z.number().optional() }),
  requireApproval: true,
  execute: async ({ name, schedule, prompt }, ctx) => {
    const telegramChatId = (ctx?.local.telegramChatId as number | undefined) ?? undefined;
    const job = await cronManager.create({ name, schedule, prompt, enabled: true, telegramChatId });
    return `Created cron job "${name}" (id: ${job.id}) with schedule: ${schedule}`;
  },
});

export const cronListTool = tool({
  name: 'cron_list',
  description: 'List all scheduled cron jobs with their status and schedules.',
  inputSchema: z.object({}),
  execute: async () => {
    const jobs = cronManager.list();
    if (jobs.length === 0) return 'No cron jobs configured.';
    return jobs
      .map((j) => `- [${j.id.slice(0, 8)}] "${j.name}" | ${j.schedule} | ${j.enabled ? 'enabled' : 'disabled'} | Prompt: ${j.prompt.slice(0, 60)}`)
      .join('\n');
  },
});

export const cronDeleteTool = tool({
  name: 'cron_delete',
  description: 'Delete a scheduled cron job by its ID.',
  inputSchema: z.object({
    id: z.string().describe('The cron job ID or prefix'),
  }),
  requireApproval: true,
  execute: async ({ id }) => {
    await cronManager.delete(id);
    return `Deleted cron job: ${id}`;
  },
});

export function registerCronTools(): void {
  // imported at call site via static import in index.ts after cronManager.initialize()
}
