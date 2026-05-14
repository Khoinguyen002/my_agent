import { agentCore } from '../../agent/core.js';
import type { StreamDelta } from '../../types/index.js';
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

const SYSTEM_PROMPT = `Extract all line items from this handwritten price list image into JSON.

For each row, extract:
- "item": product name — write your best guess as-is, do NOT overthink it
- "quantity": first number
- "unit_price": second number
- "total": the result after "="
- "note": leave empty string "" if confident; otherwise briefly flag the issue
  (e.g. "item name unclear", "quantity unreadable", "total may be 1015 or 1075")

Also extract:
- "grand_total": the final summed number below the line
- "summary_note": any other text on the page (e.g. discounts, memos)

Return ONLY valid JSON:
{
  "items": [
    {
      "item": "string",
      "quantity": number | null,
      "unit_price": number | null,
      "total": number | null,
      "note": "string"
    }
  ],
  "grand_total": number | null,
  "summary_note": "string"
}

Rules:
- Product names: take your best guess and move on, do not dwell on them
- Decimal separator: treat "," as "." (e.g. 17,5 → 17.5)
- Null only when a number is truly unreadable
- No extra explanation outside the JSON block
- Your entire response must fit within 5000 tokens. Be concise.
`;

function buildUserText(hints: string[]): string {
  const hintText = hints.length ? hints.join(', ') : '(none)';
  return `Extract the rows from the image. Product hints: ${hintText}.`;
}

function buildInput(imageUrl: string, hints: string[]): AgentInput {
  const parts: AgentContentPart[] = [
    { type: 'text', text: buildUserText(hints) },
    { type: 'image_url', url: imageUrl },
  ];
  return { parts };
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
    { conversationId: 'price-list', requestApproval: async () => false },
    { systemPrompt: SYSTEM_PROMPT, maxTurns: 1, onDelta },
  );

  logger.info('Price-list parse: model output', { length: content.length });

  if (!content) return { items: [] };

  try {
    const parsed = JSON.parse(content) as PriceListResult;
    if (!parsed || !Array.isArray(parsed.items)) throw new Error('Invalid JSON shape');
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
