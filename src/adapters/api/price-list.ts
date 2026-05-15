import { agentCore } from '../../agent/core.js';
import { env } from '../../config/env.js';
import type { AgentInput, StreamDelta } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import {
  PRICE_LIST_RESPONSE_FORMAT,
  INVOICES_TRANSCRIPTION_USER_PROMPT,
  INVOICES_TRANSCRIPTION_SYSTEM_PROMPT,
} from './config/index.js';

export type PriceListItem = {
  item: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  note: string;
};

export type PriceListResult = {
  items: PriceListItem[];
  grand_total: number | null;
  summary_note: string;
};

function buildInput(imageUrl: string, hints: string[]): AgentInput {
  // const hintText = hints.length ? `\nKnown products: ${hints.join(', ')}` : '';

  return {
    userPrompt: { image: { url: imageUrl }, text: INVOICES_TRANSCRIPTION_USER_PROMPT },
    systemPrompt: INVOICES_TRANSCRIPTION_SYSTEM_PROMPT,
  };
}

export async function parsePriceListImage(
  imageUrl: string,
  hints: string[] = env.productHints,
  onDelta?: (delta: StreamDelta) => void,
): Promise<PriceListResult> {
  logger.info('Price-list parse: start', { imageUrl, hints: hints.length });

  const input = buildInput(imageUrl, hints);
  const content = await agentCore.run(
    input,
    { requestApproval: async () => false },
    {
      maxTurns: 1,
      onDelta,
      responseFormat: PRICE_LIST_RESPONSE_FORMAT,
      noTools: true,
      temperature: 0,
    },
  );

  logger.info('Price-list parse: model output', { length: content.length });

  if (!content) return { items: [], grand_total: null, summary_note: '' };

  try {
    const parsed = JSON.parse(content) as PriceListResult;
    if (!parsed || !Array.isArray(parsed.items)) throw new Error('Invalid JSON shape');
    return parsed;
  } catch (err) {
    return {
      items: [
        {
          item: '',
          quantity: null,
          unit_price: null,
          total: null,
          note: `Parse error: ${String(err)}`,
        },
      ],
      grand_total: null,
      summary_note: '',
    };
  }
}
