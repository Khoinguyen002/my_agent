import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

function require(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  openrouterApiKey: require('OPENROUTER_API_KEY'),
  model: require('MODEL'),
  // Optional: "deepinfra/bf16" → { order: ["DeepInfra"], quantizations: ["bf16"] }
  provider: process.env['PROVIDER'],
  // Set to "1" to enable OpenRouter context-compression plugin (requires provider support)
  contextCompression: process.env['CONTEXT_COMPRESSION'] === '1',
  telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'],
  dataDir: optional('DATA_DIR', './data'),
} as const;
