export function truncate(str: string, maxLen = 80): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + '...';
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Parse "deepinfra/bf16" → ProviderPreferences object for @openrouter/sdk.
// Format: "<provider>[/<quantization>]"  (provider name is case-insensitive)
import type { ProviderPreferences } from '@openrouter/sdk/models/providerpreferences.js';

const PROVIDER_NAME_MAP: Record<string, string> = {
  deepinfra: 'DeepInfra',
  together: 'Together',
  fireworks: 'Fireworks',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  azure: 'Azure',
  groq: 'Groq',
  mistral: 'Mistral',
  cohere: 'Cohere',
  lepton: 'Lepton',
  'lambda-labs': 'Lambda',
  lambda: 'Lambda',
};

export function parseProviderString(providerStr: string | undefined): ProviderPreferences | undefined {
  if (!providerStr) return undefined;
  const [rawProvider, quantization] = providerStr.split('/');
  if (!rawProvider) return undefined;
  const name = PROVIDER_NAME_MAP[rawProvider.toLowerCase()] ?? rawProvider;
  const result: ProviderPreferences = { order: [name], allowFallbacks: false };
  if (quantization) result.quantizations = [quantization.toLowerCase() as import('@openrouter/sdk/models/quantization.js').Quantization];
  return result;
}
