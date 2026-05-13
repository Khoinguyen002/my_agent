import { callModel } from '../../llm/model.js';
import type { AgentContentPart, AgentInput } from '../../types/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export type PriceListItem = {
  product: string;
  quantity: number | null;
  price: number | null;
  total: number | null;
  note: string | null;
};

export type PriceListResult = {
  items: PriceListItem[];
};

const SYSTEM_PROMPT = `You extract a price list from a photo. The list has columns: product name, quantity, price, total price.
Return STRICT JSON ONLY with this shape:
{"items":[{"product":"string","quantity":number|null,"price":number|null,"total":number|null,"note":string|null}]}
Rules:
- Use numbers (not strings) for quantity, price, total. Use null if unreadable.
- If unsure about any field, keep best guess and add a short reason to note.
- Try to match product names to the closest name from the provided hints if possible.
- Do not add extra keys or commentary.
`;

function buildUserText(hints: string[]): string {
  const hintText = hints.length ? hints.join(', ') : '(none)';
  return `Extract the rows from the image. Product hints: ${hintText}.`;
}

function buildInput(imageUrl: string, hints: string[]): AgentInput {
  const parts: AgentContentPart[] = [
    // { type: 'text', text: buildUserText(hints) },
    { type: 'image_url', url: imageUrl },
  ];
  return { parts };
}

export async function parsePriceListImage(
  imageUrl: string,
  hints: string[] = env.productHints,
): Promise<PriceListResult> {
  logger.info('Price-list parse: start', {
    imageUrl,
    hints: hints.length,
  });
  const input = buildInput(imageUrl, hints);
  const result = await callModel(input, [], [], SYSTEM_PROMPT);

  const content = result.kind === 'chat' ? result.content : '';
  logger.info('Price-list parse: model output', {
    kind: result.kind,
    length: content.length,
  });
  if (!content) {
    return { items: [] };
  }

  try {
    const parsed = JSON.parse(content) as PriceListResult;
    if (!parsed || !Array.isArray(parsed.items)) {
      throw new Error('Invalid JSON shape');
    }
    return parsed;
  } catch (err) {
    return {
      items: [
        {
          product: '',
          quantity: null,
          price: null,
          total: null,
          note: `Invalid JSON from model: ${String(err)}`,
        },
      ],
    };
  }
}
