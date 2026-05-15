import { OpenRouter } from '@openrouter/sdk';
import { env } from '../config/env.js';

export const openrouterClient = new OpenRouter({
  apiKey: env.openrouterApiKey,
  serverURL: env.openrouterServerUrl,
});

// Shared per-request identity headers for all calls
export const requestMeta = {
  httpReferer: 'https://github.com/my-agent',
  appTitle: 'my-agent',
} as const;
