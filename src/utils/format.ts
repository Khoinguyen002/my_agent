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

export function parseProvidersString(
  providersStr: string | undefined,
): ProviderPreferences | undefined {
  if (!providersStr) return undefined;
  let nameOrder: string[] = [];
  let quantizations: ProviderPreferences['quantizations'] = [];
  const providerEntries = providersStr.split(',').map((s) => s.trim());

  for (const entry of providerEntries) {
    const [rawProvider, quantization] = entry.split('/');
    if (!rawProvider) continue;
    const name = PROVIDER_NAME_MAP[rawProvider.toLowerCase()] ?? rawProvider;
    nameOrder.push(name);

    if (quantization) {
      quantizations.push(
        quantization.toLowerCase() as import('@openrouter/sdk/models/quantization.js').Quantization,
      );
    }
  }

  if (nameOrder.length === 0) return undefined;
  return { order: nameOrder, allowFallbacks: true, quantizations };
}
