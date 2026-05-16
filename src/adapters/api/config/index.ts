import { ResponseFormat } from '@openrouter/sdk/models';
import { env } from '../../../config/env.js';

export const INVOICES_TRANSCRIPTION_USER_PROMPT = `
You are a STRICT, LITERAL OCR TRANSCRIBER. You must output ONLY valid JSON without any conversational text or markdown outside the JSON block.

CRITICAL RULES TO PREVENT OVERTHINKING:
1. EARLY EXIT: If the image does not contain rows following the pattern [item | quantity | unit_price = total] (e.g., it is a general photo, standard receipt, or blank page), STOP IMMEDIATELY and return: { "items": [], "grand_total": null, "summary_note": "<brief description of the image>" }.
2. NO SEMANTIC INTERPRETATION: Do NOT try to understand what words mean or correct spelling. Transcribe literal visual shapes (e.g., if it visually looks like '18 o tay', write '18 o tay', do NOT deduce it means 'Cá Tra').
3. NO SECOND-GUESSING: Trust your first visual impression. Do not debate. Read letters as shapes, output the closest characters, and move on.
4. ISOLATE ROWS: Ignore floating numbers/text (like '10-5') that do not belong to the standard calculation pattern.
5. CONCISENESS: Output must fit within ${env.maxOutputTokens} tokens. Keep strings exact and brief.

OUTPUT SCHEMA:
Return a JSON object with the following structure:
{
  "items": [
    {
      "item": "Literal transcription of the characters seen",
      "quantity": <first number>,
      "unit_price": <second number>,
      "total": <number after '=' sign>,
      "note": "[Math Status] | [OCR Status]"
    }
  ],
  "grand_total": <final summed number below the last row, or null>,
  "summary_note": "Any other floating text/memos, or the fallback description if Rule 1 applies"
}

NOTE FIELD FORMATTING GUIDELINES:
- [Math Status]: Write "Tính: Đúng" if (quantity * unit_price) exactly equals the total. If it does not match, you MUST calculate the correct result and write exactly: "Tính: Sai ❌ - <quantity> x <unit_price> = <correct_result> (nhưng trong hàng lại ghi là <total>)".
- [OCR Status]: Leave empty string "" if you are 100% certain about every character in the "item" column. If you have ANY hesitation, write "Cần xem lại: <brief visual reason in Vietnamese>" specifying exactly which letters or words are ambiguous. Do NOT guess real-world meanings here, just describe the visual ambiguity in Vietnamese.

Example notes:
- "Tính: Đúng | " 
- "Tính: Sai ❌ - 10 x 10 = 100 (thành tiền lại là 99) | Cần xem lại: chữ 'o' trong 'o tay' nhìn giống chữ 'a' hoặc 'u'"
- "Tính: Đúng | Cần xem lại: từ đầu tiên bị mờ, dự đoán nét chữ là 'Cá beef'"
`;

export const INVOICES_TRANSCRIPTION_SYSTEM_PROMPT = `
You are a STRICT, LITERAL OCR TRANSCRIBER. 
Your ONLY job is to extract exact visual characters from the handwritten price list into JSON.
NO SEMANTIC INTERPRETATION: Do NOT try to understand what the words mean. Do NOT correct spelling. Do NOT guess real-world product names.
`;

export const PRICE_LIST_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_object',
  // jsonSchema: {
  //   name: 'price_list_result',
  //   description: 'Extracted price list items from the image',
  //   schema: {
  //     type: 'object',
  //     properties: {
  //       items: {
  //         type: 'array',
  //         items: {
  //           type: 'object',
  //           properties: {
  //             item: {
  //               type: 'string',
  //               description: 'Literal transcription of the product name as it appears in the image',
  //             },
  //             quantity: { type: ['number', 'null'], description: 'The quantity of the item' },
  //             unit_price: {
  //               type: ['number', 'null'],
  //               description: 'The price per unit of the item',
  //             },
  //             total: { type: ['number', 'null'], description: 'The total price for the item' },
  //             note: {
  //               type: 'string',
  //               description:
  //                 'Mark "pass" ONLY if you had ZERO hesitation on every character and number of this row',
  //             },
  //           },
  //           required: ['item', 'quantity', 'unit_price', 'total', 'note'],
  //         },
  //       },
  //       grand_total: { type: ['number', 'null'] },
  //       summary_note: {
  //         type: 'string',
  //         description:
  //           'Any other text on the page (discounts, memos), or the fallback description if rule 1 applies.',
  //       },
  //     },
  //     required: ['items', 'grand_total', 'summary_note'],
  //     additionalProperties: false,
  //   },
  //   strict: true,
  // },
};
