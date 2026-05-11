import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import type { CronJob } from '../types/index.js';

function cronPath(): string {
  return path.resolve(env.dataDir, 'crons.json');
}

export function loadCrons(): CronJob[] {
  const p = cronPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as CronJob[];
  } catch {
    return [];
  }
}

export function saveCrons(jobs: CronJob[]): void {
  const p = cronPath();
  const tmp = p + '.tmp';
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2));
  fs.renameSync(tmp, p);
}
