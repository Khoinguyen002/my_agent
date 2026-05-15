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

function toNumber(val: string): number {
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const env = {
  openrouterApiKey: require('OPENROUTER_API_KEY'),
  openrouterServerUrl: optional('OPENROUTER_SERVER_URL', 'https://openrouter.ai/api/v1'),
  model: require('MODEL'),
  // Optional: "deepinfra/bf16" → { order: ["DeepInfra"], quantizations: ["bf16"] }
  providers: process.env['PROVIDERS'],
  // Set to "1" to enable OpenRouter context-compression plugin (requires provider support)
  contextCompression: process.env['CONTEXT_COMPRESSION'] === '1',
  telegramBotToken: process.env['TELEGRAM_BOT_TOKEN'],
  dataDir: optional('DATA_DIR', './data'),
  apiPort: toNumber(optional('API_PORT', '0')),
  maxOutputTokens: toNumber(optional('MAX_OUTPUT_TOKENS', '4096')),
  productHints: optional('PRODUCT_HINTS', '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
  // Google OAuth (user) credentials
  googleOAuthClientId: optional('GOOGLE_OAUTH_CLIENT_ID', ''),
  googleOAuthClientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET', ''),
  googleOAuthRefreshToken: optional('GOOGLE_OAUTH_REFRESH_TOKEN', ''),
  // Optional Drive folder ID to upload files
  driveFolderId: optional('DRIVE_FOLDER_ID', ''),
  // Set to "0" to skip making files public
  drivePublic: optional('DRIVE_PUBLIC', '1') === '1',
  // OpenAI-compatible provider (e.g. Xiaomi MiMo). When set, all model calls use this client.
  openaiCompatApiKey: optional('OPENAI_COMPAT_API_KEY', ''),
  openaiCompatBaseUrl: optional('OPENAI_COMPAT_BASE_URL', ''),
  openaiCompatModel: optional('OPENAI_COMPAT_MODEL', ''),
  // Comma-separated allowed CORS origins, e.g. "https://app.example.com,http://localhost:5173"
  corsOrigins: optional('CORS_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
} as const;
