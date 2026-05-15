import { ResponseFormat } from '@openrouter/sdk/models';
import { env } from '../../../config/env.js';

export const INVOICES_TRANSCRIPTION_USER_PROMPT = `
You are a STRICT, LITERAL OCR TRANSCRIBER. Your ONLY job is to extract exact visual characters from the handwritten price list into JSON.

CRITICAL RULES TO PREVENT OVERTHINKING:
1. STOP REASONING if the image does not contain rows that follow the pattern [item  quantity  unit_price = total]. If no such rows exist (e.g. the image is a photo, a receipt, a blank page, or unrelated content), immediately return: { "items": [], "grand_total": null, "summary_note": "<one sentence describing what the image actually shows>" }. Do NOT attempt to extract data from non-price-list images.
2. NO SEMANTIC INTERPRETATION: Do NOT try to understand what the words mean. Do NOT correct spelling. Do NOT guess real-world product names (e.g., if it looks visually like '18 o tay', write '18 o tay', do NOT try to deduce that it means 'Cá Tra').
3. NO SECOND-GUESSING: Trust your first visual impression. Do not debate with yourself. Read the letters as shapes, output the closest matching characters, and immediately move to the next line.
4. ISOLATE ROWS: Ignore floating numbers or text (like '10-5') that do not explicitly follow the row calculation pattern [item  quantity  unit_price = total].
5. MAXIMUM ${env.maxOutputTokens} tokens to be available to consumed. Please concise.

**For each row, extract exactly:
- "item": Literal transcription of the characters you see.
- "quantity": The first number - Float.
- "unit_price": The second number - Float.
- "total": The number after the '=' sign.

**ADD "note" column: Leave it empty "" ONLY if you had ZERO hesitation on every character and number of this row.

**Also extract:
- "grand_total": The final summed number below the last row, or null if absent.
- "summary_note": Any other text on the page (discounts, memos), or the fallback description if rule 1 applies.`;

export const INVOICES_TRANSCRIPTION_SYSTEM_PROMPT = `
You are a STRICT, LITERAL OCR TRANSCRIBER. 
Your ONLY job is to extract exact visual characters from the handwritten price list into JSON.
MAXIMUM 4096 tokens. PLEASE CONCISE.
NO SEMANTIC INTERPRETATION: Do NOT try to understand what the words mean. Do NOT correct spelling. Do NOT guess real-world product names.
`;

export const PRICE_LIST_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  jsonSchema: {
    name: 'price_list_result',
    description: 'Extracted price list items from the image',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: {
                type: 'string',
                description: 'Literal transcription of the product name as it appears in the image',
              },
              quantity: { type: ['number', 'null'], description: 'The quantity of the item' },
              unit_price: {
                type: ['number', 'null'],
                description: 'The price per unit of the item',
              },
              total: { type: ['number', 'null'], description: 'The total price for the item' },
              note: {
                type: 'string',
                description:
                  'Leave it empty "tao bit roi" ONLY if you had ZERO hesitation on every character and number of this row',
              },
            },
            required: ['item', 'quantity', 'unit_price', 'total', 'note'],
          },
        },
        grand_total: { type: ['number', 'null'] },
        summary_note: {
          type: 'string',
          description:
            'Any other text on the page (discounts, memos), or the fallback description if rule 1 applies.',
        },
      },
      required: ['items', 'grand_total', 'summary_note'],
      additionalProperties: false,
    },
    strict: true,
  },
};
