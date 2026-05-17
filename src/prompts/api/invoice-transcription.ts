import { env } from '../../config/env.js';
import { PromptTemplate } from '../core/index.js';
import { Output, Rule, Task } from '../core/type.js';

export const buildInvoiceTranscriptionPrompt = () => {
  const role =
    'You are a STRICT, LITERAL OCR TRANSCRIBER. You must output ONLY valid JSON without any conversational text or markdown outside the JSON block';

  const rules: Rule[] = [
    {
      title: 'EARLY EXIT',
      description:
        'If the image does not contain rows following the pattern [item | quantity | unit_price = total] (e.g., it is a general photo, standard receipt, or blank page), STOP IMMEDIATELY and return: { "items": [], "grand_total": null, "summary_note": "<brief description of the image>" }',
    },
    {
      title: 'NO SEMANTIC INTERPRETATION',
      description:
        "Do NOT try to understand what words mean or correct spelling. Transcribe literal visual shapes (e.g., if it visually looks like '18 o tay', write '18 o tay', do NOT deduce it means 'Cá Tra')",
    },
    {
      title: 'NO SECOND-GUESSING',
      description:
        'Trust your first visual impression. Do not debate. Read letters as shapes, output the closest characters, and move on.',
    },
    {
      title: 'NEVER MODIFY NUMBERS',
      description:
        'The "quantity", "unit_price", and "total" fields must be the EXACT digits written in the image — no rounding, no recalculating, no "correcting". Output all numbers as plain JSON numbers using dot as decimal separator (e.g. 17.5, not "17,5").',
    },
    {
      title: 'ISOLATE ROWS',
      description:
        "Ignore floating numbers/text (like '10-5') that do not belong to the standard calculation pattern.",
    },
    {
      title: 'CONCISENESS',
      description: `Output must fit within ${env.maxOutputTokens} tokens. Keep strings exact and brief.`,
    },
  ];

  const output: Output = {
    type: 'json',
    jsonSchema: {
      items: [
        {
          item: 'Literal transcription of the characters seen',
          quantity: 0,
          unit_price: 0,
          total: 0,
          note: '[Math Status] | [OCR Status]',
        },
      ],
      grand_total: 0,
      summary_note: 'Any other floating text/memos, or the fallback description if Rule 1 applies',
    },
  };

  const notes: Task[] = [
    {
      title: 'NOTE FIELD FORMATTING GUIDELINES',
      description:
        'Before filling the "note" field for any row, you MUST explicitly recalculate quantity × unit_price for EVERY row first.',
      notes: [
        '⚠️ Recalculate each row independently before writing any note. Do NOT skip or assume.',
        '[Math Status]: Write "Correct" if quantity × unit_price exactly equals total. If it does not match, write exactly: "Incorrect ❌ - <quantity> x <unit_price> = <correct_result> (but the row shows <total>)".',
        '[OCR Status]: Leave empty "" if you are 100% certain about every character in the "item" column. If any uncertainty, write "Needs review: <brief visual reason in English>" describing exactly which letters or words are ambiguous. Do NOT guess real-world meanings; only describe visual ambiguity.',
      ],
      fewShotExamples: [
        {
          input: 'quantity=10, unit_price=10, total=99, item="o tay"',
          output:
            'Tính: Sai ❌ - 10 x 10 = 100 (thành tiền lại là 99) | Cần xem lại: chữ "o" trong "o tay" nhìn giống chữ "a" hoặc "u"',
        },
        {
          input: 'quantity=5, unit_price=20, total=100, item="Cá beef"',
          output: 'Tính: Đúng | Cần xem lại: từ đầu tiên bị mờ, dự đoán nét chữ là "Cá beef"',
        },
        {
          input: 'quantity=2, unit_price=5000, total=10000, item="Bánh mì"',
          output: 'Tính: Đúng | ',
        },
      ],
    },
  ];

  const tasks: Task[] = [
    {
      title: 'TRANSCRIBE INVOICE',
      description:
        'Extract exact visual characters from the handwritten price list into JSON following the rules, output schema and notes.',
    },
  ];

  return new PromptTemplate({ role, output, rules, notes, tasks }).build();
};

export const buildInvoicesTranscriptionSystemPrompt = () => {
  const role =
    'You are a STRICT, LITERAL OCR TRANSCRIBER. Output ONLY valid JSON without any conversational text or markdown outside the JSON block';

  const tasks: Task[] = [
    {
      title: 'TRANSCRIBE CHARACTERS',
      description:
        'Extract exact visual characters from the handwritten price list into JSON. Do NOT try to understand what the words mean. Do NOT correct spelling. Do NOT guess real-world product names.',
    },
  ];

  return new PromptTemplate({ role, tasks }).build();
};
