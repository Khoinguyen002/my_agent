import { PromptTemplate } from '../core/index.js';
import { Output, Task } from '../core/type.js';

type PriceListResult = { items: unknown[]; grand_total: number | null; summary_note: string };
type UnknownProduct = { ocr_name: string; correct_name: string };

export const buildVerificationSystemPrompt = () => {
  const role = 'a STRICT JSON verifier for price-list transcriptions';

  const tasks: Task[] = [
    {
      title: 'VERIFY AND CORRECT',
      description: 'Verify math and correct product names using provided reference lists.',
    },
  ];

  const globalInstruction = 'Output ONLY valid JSON — no markdown, no explanation.';

  return new PromptTemplate({ role, tasks, globalInstruction }).build();
};

export const buildVerificationPrompt = (
  result: PriceListResult,
  hints: string[],
  unknowns: UnknownProduct[],
): string => {
  const hintList = hints.length ? hints.map((h) => `- ${h}`).join('\n') : '(none)';
  const unknownTable = unknowns.length
    ? unknowns
        .map((u) => `"${u.ocr_name}" → ${u.correct_name ? `"${u.correct_name}"` : '(pending)'}`)
        .join('\n')
    : '(none yet)';

  const role = 'Verifying an OCR price-list transcription. Perform ALL tasks below in order';

  const tasks: Task[] = [
    {
      title: 'VERIFY MATH (do this for every row before anything else)',
      description:
        'NEVER MODIFY NUMBERS. The "quantity", "unit_price", and "total" fields must be the EXACT digits written in the INPUT JSON — no rounding, no recalculating, no "correcting". Recalculate quantity × unit_price independently for each item and check if it matches the total. If it does not match, record the correct calculation in the note but do NOT change the total field.',
    },
    {
      title: 'VERIFY AND CORRECT PRODUCT NAMES',
      description: `Known product hints (reference list A — canonical correct spellings):\n${hintList}\n\nUnknown products table (reference list B — past OCR mistakes mapped to confirmed correct names, use as training data):\n${unknownTable}\n\nFor each item's "item" value, apply these rules IN ORDER and stop at the first match:`,
      notes: [
        'Exact match in list A → keep as-is. ✅ exact.',
        'Exact string match against an ocr_name in list B with a confirmed correct_name → set "item" to that correct_name. ✅ exact. Do NOT treat this as fuzzy — the ocr_name was already seen and confirmed by the user.',
        'Fuzzy match in list A (item is NOT in list A exactly, but clearly an OCR noise variant: missing/wrong diacritics, swapped letters, truncated word) → set "item" to the matching hint\'s exact spelling. ✅ fuzzy — add original OCR value to "_fuzzy_unknowns".',
        'Fuzzy match against an ocr_name in list B with a confirmed correct_name (item is NOT an exact ocr_name match, but looks like a variant of one) → set "item" to that correct_name. ✅ fuzzy — add original OCR value to "_fuzzy_unknowns".',
        'Exact or fuzzy match against an ocr_name in list B where correct_name is (pending) → unrecognized, keep "item" unchanged, add to "_new_unknowns".',
        'No match anywhere → unrecognized, keep "item" unchanged, add to "_new_unknowns".',
      ],
    },
    {
      title: 'VERIFY GRAND TOTAL',
      description:
        'Use Vietnamese. Do both steps below and write a free-form note in "summary_note" — no strict format required, just be clear and accurate, add flag icon according to the result.',
      subTasks: [
        'Sum all written "total" values row by row and compare with grand_total.',
        'Sum all recalculated (qty × price) values. If any row had wrong math in TASK 1, the recalculated sum will differ — mention it.',
      ],
    },
    {
      title: 'REWRITE THE "note" FIELD',
      description: "NEVER MODIFY NUMBERS. Replace each item's existing note entirely:",
      notes: [
        '"✅" — math correct AND name matched exactly (rules 1 or 2).',
        '"✅ ⚠️ Fuzzy: <original_ocr_name> → <corrected_name>" — math correct AND name matched via fuzzy inference (rules 3 or 4 ONLY).',
        '"❌ <reason>" — anything wrong, in Vietnamese:\n    • Math wrong: "Tính sai: <qty> x <price> = <correct_result> (ghi <total>)"\n    • Name unrecognized: "Không nhận diện sản phẩm"\n    • Fuzzy match + math wrong: combine both, e.g. "Tính sai: ... | ⚠️ Fuzzy: <original> → <corrected>"\n    • Both unrecognized and math wrong: "Tính sai: ... | Không nhận diện sản phẩm"',
      ],
    },
  ];

  const output: Output = {
    type: 'json',
    jsonSchema: {
      items: [{ item: '...', quantity: 0, unit_price: 0, total: 0, note: '✅ or ❌ ...' }],
      grand_total: 0,
      summary_note: '<string>',
      _new_unknowns: ['<original OCR value — rules 5 & 6 only>'],
      _fuzzy_unknowns: ['<original OCR value — rules 3 & 4 only>'],
    },
  };

  const input = `INPUT JSON to verify:\n${JSON.stringify(result, null, 2)}`;

  return new PromptTemplate({ role, tasks, output, input }).build();
};
