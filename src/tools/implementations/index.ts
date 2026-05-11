import { toolRegistry } from '../registry.js';
import { calculatorTool } from './calculator.js';
// cron-manager is registered after CronManager is initialized — see cron/manager.ts

export function registerBuiltinTools(): void {
  toolRegistry.register(calculatorTool);
}
