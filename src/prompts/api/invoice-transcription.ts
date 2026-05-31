import { PromptTemplate } from '../core/index.js';
import { Output, Rule, Task } from '../core/type.js';
import type { PriceListPromptReferenceData } from '../../adapters/api/types/price-list-types.js';

function buildReferenceText(groups: PriceListPromptReferenceData['groups']): string {
  if (!groups.length) {
    return '(none)';
  }

  return groups
    .map((group: PriceListPromptReferenceData['groups'][number]) => {
      const aliases = group.aliases.length ? group.aliases.join(', ') : '(exact canonical only)';
      return `- ${group.canonical}: ${aliases}`;
    })
    .join('\n');
}

function buildSimilarGroupText(
  similarGroups: PriceListPromptReferenceData['similarGroups'],
): string {
  if (!similarGroups.length) {
    return '(none)';
  }

  return similarGroups
    .map((group) => {
      const [first, ...rest] = group;
      return rest.length
        ? `- ${first} (priority); similar names: ${rest.join(', ')}`
        : `- ${first} (priority)`;
    })
    .join('\n');
}

export const buildInvoiceTranscriptionPrompt = (refs: PriceListPromptReferenceData): string => {
  const role =
    'You are a STRICT OCR TRANSCRIBER AND VERIFIER. Output ONLY valid JSON, with no conversational text or markdown outside the JSON block';

  const rules: Rule[] = [
    {
      title: 'EARLY EXIT',
      description:
        'If the image does not contain rows following the pattern [item | quantity | unit_price = total] (e.g., it is a general photo, standard receipt, or blank page), STOP IMMEDIATELY and return: { "items": [], "grand_total": null, "summary_note": "<brief description of the image>" }',
    },
    {
      title: 'MINIMAL REASONING',
      description:
        'Keep internal reasoning minimal. Math verification only. No linguistic explanations or matching walkthroughs. Do not invent or append units to item names, notes, or calculations. If a similar_group row applies, pick the first entry in that row directly and jump straight to JSON.',
    },
  ];

  const output: Output = {
    type: 'json',
    jsonSchema: {
      items: [
        {
          item: 'Name of the product, follow VERIFY AND CORRECT PRODUCT NAMES task',
          quantity: 0,
          unit_price: 0,
          total: 0,
          note: '[Math Status] | [OCR Status] — follow ADD THE "note" FIELD task',
        },
      ],
      grand_total: 0,
      summary_note: 'Any other floating text/memos, or the fallback description if Rule 1 applies',
    },
  };

  const tasks: Task[] = [
    {
      title: 'TRANSCRIBE INVOICE',
      description: 'Extract exact visible characters from the handwritten price list into JSON.',
    },
    {
      title: 'MATCH PRODUCT NAMES USING GROUPS',
      description: `Canonical product groups from the reference table below. The header is the exact spelling to use; aliases are OCR variants that should collapse into that canonical name:\n${buildReferenceText(refs.groups)}\n\nPriority similar-group rows: if the OCR text matches or resembles any entry in one of these rows, choose the first entry in that row and do not compare the entries against each other:\n${buildSimilarGroupText(refs.similarGroups)}\n\nIf no match is found at any step, keep the raw OCR text as-is.\n\nFor each item's "item" value, apply these rules IN ORDER and stop at the first match:`,
      subTasks: [
        'Exact match against a canonical header → keep that exact spelling.',
        'Exact match against an alias under a canonical header → convert it to the canonical header spelling.',
        'If a similar_group row applies, choose the first entry in that row and do not think about alternatives.',
        'If no match is found, keep the original raw OCR text as-is.',
      ],
    },
    {
      title: 'VERIFY GRAND TOTAL',
      rules: [
        {
          title: 'KEEP QUANTITY, UNIT PRICE, TOTAL FIELDS UNCHANGED',
          description:
            'NEVER MODIFY NUMBERS. Do NOT change any of these fields, just verify and mention discrepancies in the note if any.',
        },
      ],
      description:
        'Use Vietnamese. Do subtask below and write a free-form note in "summary_note" — no strict format required, just be clear, accurate, concise.',
      subTasks: [
        'Calculate (qty x price) by yourself then sum it all then compare with grand_total. If any row had wrong math => mention it in "note".',
      ],
    },
    {
      title: 'FORMAT THE "note" FIELD',
      description:
        'Add "note" for each item according to the verification result of that row. Keep it short.',

      fewShotExamples: [
        {
          input: 'Math wrong',
          output: '❌ Tính sai <briefly mention which part is wrong>',
        },
        {
          input: 'Name unrecognized',
          output: '❌ Không nhận diện sản phẩm',
        },
        {
          input: 'Math correct AND name matched exactly',
          output: '✅',
        },
      ],
    },
  ];

  return new PromptTemplate({ role, output, rules, tasks }).build();
};

export const buildInvoicesTranscriptionSystemPrompt = (): string => {
  const role = 'You are a STRICT, LITERAL OCR TRANSCRIBER AND VERIFIER.';

  const tasks: Task[] = [
    {
      title: 'TRANSCRIBE CHARACTERS',
      description:
        'Extract exact visual characters from the handwritten price list into JSON. Then verify the rows in the same response: use exact canonical or alias lookup for product names, validate math, and keep a note for every row.',
    },
  ];

  return new PromptTemplate({ role, tasks }).build();
};
