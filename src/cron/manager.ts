import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { loadCrons, saveCrons } from './store.js';
import { agentCore } from '../agent/core.js';
import { createConversation } from '../db/conversations.js';
import type { CronJob, ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { createTelegramSendTool } from '../tools/implementations/telegram-send.js';
import { getTelegramBot } from '../adapters/telegram/bot.js';

export class CronManager {
  private jobs: CronJob[] = [];
  private handles = new Map<string, cron.ScheduledTask>();

  initialize(): void {
    this.jobs = loadCrons();
    for (const job of this.jobs) {
      if (job.enabled) this.schedule(job);
    }
    logger.info(`CronManager: loaded ${this.jobs.length} jobs`);
  }

  list(): CronJob[] {
    return [...this.jobs];
  }

  async create(opts: Omit<CronJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<CronJob> {
    if (!cron.validate(opts.schedule)) {
      throw new Error(`Invalid cron expression: ${opts.schedule}`);
    }
    const now = Date.now();
    const job: CronJob = { ...opts, id: uuidv4(), createdAt: now, updatedAt: now };
    this.jobs.push(job);
    saveCrons(this.jobs);
    if (job.enabled) this.schedule(job);
    return job;
  }

  async update(id: string, patch: Partial<Omit<CronJob, 'id' | 'createdAt'>>): Promise<CronJob> {
    const idx = this.jobs.findIndex((j) => j.id === id || j.id.startsWith(id));
    if (idx === -1) throw new Error(`Cron job not found: ${id}`);

    const job = { ...this.jobs[idx]!, ...patch, updatedAt: Date.now() };
    this.jobs[idx] = job;
    saveCrons(this.jobs);

    // Reschedule
    this.handles.get(job.id)?.stop();
    this.handles.delete(job.id);
    if (job.enabled) this.schedule(job);

    return job;
  }

  async delete(id: string): Promise<void> {
    const idx = this.jobs.findIndex((j) => j.id === id || j.id.startsWith(id));
    if (idx === -1) throw new Error(`Cron job not found: ${id}`);
    const job = this.jobs[idx]!;
    this.handles.get(job.id)?.stop();
    this.handles.delete(job.id);
    this.jobs.splice(idx, 1);
    saveCrons(this.jobs);
  }

  async trigger(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id || j.id.startsWith(id));
    if (!job) throw new Error(`Cron job not found: ${id}`);
    await this.executeCron(job);
  }

  stopAll(): void {
    for (const handle of this.handles.values()) handle.stop();
    this.handles.clear();
  }

  private schedule(job: CronJob): void {
    const task = cron.schedule(job.schedule, () => {
      void this.executeCron(job);
    });
    this.handles.set(job.id, task);
  }

  private async executeCron(job: CronJob): Promise<void> {
    logger.info(`Cron executing: ${job.name}`);
    const conv = createConversation({ source: 'cron', cronJobId: job.id, title: `[cron] ${job.name}` });

    const context: ToolContext = {
      conversationId: conv.id,
      source: 'cron',
      telegramChatId: job.telegramChatId,
      requestApproval: async () => false, // cron never approves sensitive tools
    };

    const extraTools = job.telegramChatId
      ? [createTelegramSendTool(job.telegramChatId, getTelegramBot)]
      : [];

    try {
      await agentCore.run(job.prompt, conv.id, context, undefined, extraTools);
      this.updateJobStatus(job.id, 'success');
    } catch (err) {
      logger.error(`Cron failed: ${job.name}`, err);
      this.updateJobStatus(job.id, 'error');
    }
  }

  private updateJobStatus(id: string, status: 'success' | 'error'): void {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx !== -1) {
      this.jobs[idx] = { ...this.jobs[idx]!, lastRunAt: Date.now(), lastRunStatus: status, updatedAt: Date.now() };
      saveCrons(this.jobs);
    }
  }
}

export const cronManager = new CronManager();
