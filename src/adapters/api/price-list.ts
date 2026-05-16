import { agentCore } from '../../agent/core.js';
import { env } from '../../config/env.js';
import type { AgentInput, StreamDelta } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import {
  PRICE_LIST_RESPONSE_FORMAT,
  INVOICES_TRANSCRIPTION_USER_PROMPT,
  INVOICES_TRANSCRIPTION_SYSTEM_PROMPT,
  VERIFICATION_SYSTEM_PROMPT,
} from './config/index.js';
import { findOrCreateSheet, readSheetValues, writeSheetValues } from './drive.js';

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

export type UnknownProduct = {
  ocr_name: string;
  correct_name: string;
};

// ── Google-Sheet-backed product references ────────────────────────────────────
// Sheet layout:
//   Row 1:  Hints         | hint1 | hint2 | ...
//   Row 2+: similar_group | nameA | nameB | nameC | ...   (one row per group)
//   Row N:  ocr_name      | correct_name                  (table header)
//   Row N+: <ocr name>    | <correct name or empty>

const REFS_SHEET_NAME = 'price-list-references';

function buildRefsValues(
  hints: string[],
  unknowns: UnknownProduct[],
  similarGroups: string[][],
): string[][] {
  return [
    ['Hints', ...hints],
    ...similarGroups.map((g) => ['similar_group', ...g]),
    ['ocr_name', 'correct_name'],
    ...unknowns.map((u) => [u.ocr_name, u.correct_name]),
  ];
}

function parseRefsFromValues(values: string[][]): {
  hints: string[];
  unknowns: UnknownProduct[];
  similarGroups: string[][];
} {
  if (!values.length) return { hints: [], unknowns: [], similarGroups: [] };

  const [hintsRow, ...rest] = values;
  const hints = hintsRow.slice(1).filter(Boolean);

  // Find the ocr_name header row — everything before it is similar_group rows
  const ocrHeaderIdx = rest.findIndex((row) => row[0] === 'ocr_name');
  const middleRows = ocrHeaderIdx >= 0 ? rest.slice(0, ocrHeaderIdx) : [];
  const dataRows = ocrHeaderIdx >= 0 ? rest.slice(ocrHeaderIdx + 1) : rest;

  const similarGroups = middleRows
    .filter((row) => row[0] === 'similar_group')
    .map((row) => row.slice(1).filter(Boolean));

  const unknowns = dataRows.flatMap(([ocr_name = '', correct_name = '']) =>
    ocr_name ? [{ ocr_name, correct_name }] : [],
  );

  return { hints, unknowns, similarGroups };
}

async function readProductRefs(): Promise<{
  hints: string[];
  unknowns: UnknownProduct[];
  similarGroups: string[][];
}> {
  const folderId = env.driveFolderId;
  if (!folderId) return { hints: [], unknowns: [], similarGroups: [] };
  try {
    const sheetId = await findOrCreateSheet(REFS_SHEET_NAME, folderId);
    const values = await readSheetValues(sheetId);
    const parsed = parseRefsFromValues(values);
    // Fall back to config seed if sheet has no groups yet
    return {
      ...parsed,
      similarGroups: parsed.similarGroups.length ? parsed.similarGroups : [],
    };
  } catch {
    return { hints: [], unknowns: [], similarGroups: [] };
  }
}

async function saveProductRefs(
  hints: string[],
  unknowns: UnknownProduct[],
  similarGroups: string[][],
): Promise<void> {
  const folderId = env.driveFolderId;
  if (!folderId) return;
  const sheetId = await findOrCreateSheet(REFS_SHEET_NAME, folderId);
  await writeSheetValues(sheetId, buildRefsValues(hints, unknowns, similarGroups));
}

// ── Verification (second agent call) ─────────────────────────────────────────

function buildVerificationPrompt(
  result: PriceListResult,
  hints: string[],
  unknowns: UnknownProduct[],
): string {
  const hintList = hints.length ? hints.map((h) => `  - ${h}`).join('\n') : '  (none)';
  const unknownTable = unknowns.length
    ? unknowns
        .map((u) => `  "${u.ocr_name}" → ${u.correct_name ? `"${u.correct_name}"` : '(pending)'}`)
        .join('\n')
    : '  (none yet)';

  return `You are verifying an OCR price-list transcription. Perform ALL tasks below in order.

TASK 1 — VERIFY MATH (do this for every row before anything else):
NEVER MODIFY NUMBERS. The "quantity", "unit_price", and "total" fields must be the EXACT digits written in the INPUT JSON — no rounding, no recalculating, no "correcting".
Recalculate quantity × unit_price independently for each item and check if it matches the total. If it does not match, record the correct calculation in the note but do NOT change the total field.

TASK 2 — VERIFY AND CORRECT PRODUCT NAMES:
Known product hints (reference list A — canonical correct spellings):
${hintList}

Unknown products table (reference list B — past OCR mistakes mapped to confirmed correct names, use as training data):
${unknownTable}

For each item's "item" value, apply these rules IN ORDER and stop at the first match:
1. Exact match in list A → keep as-is. ✅ exact.
2. Exact string match against an ocr_name in list B with a confirmed correct_name → set "item" to that correct_name. ✅ exact. Do NOT treat this as fuzzy — the ocr_name was already seen and confirmed by the user.
3. Fuzzy match in list A (item is NOT in list A exactly, but clearly an OCR noise variant: missing/wrong diacritics, swapped letters, truncated word) → set "item" to the matching hint's exact spelling. ✅ fuzzy — add original OCR value to "_fuzzy_unknowns".
4. Fuzzy match against an ocr_name in list B with a confirmed correct_name (item is NOT an exact ocr_name match, but looks like a variant of one) → set "item" to that correct_name. ✅ fuzzy — add original OCR value to "_fuzzy_unknowns".
5. Exact or fuzzy match against an ocr_name in list B where correct_name is (pending) → unrecognized, keep "item" unchanged, add to "_new_unknowns".
6. No match anywhere → unrecognized, keep "item" unchanged, add to "_new_unknowns".

TASK 3 — REWRITE THE "note" FIELD:
NEVER MODIFY NUMBERS
Replace each item's existing note entirely:
- "✅" — math correct AND name matched exactly (rules 1 or 2).
- "✅ ⚠️ Fuzzy: <original_ocr_name> → <corrected_name>" — math correct AND name matched via fuzzy inference (rules 3 or 4 ONLY).
- "❌ <reason>" — anything wrong, in Vietnamese:
    • Math wrong: "Tính sai: <qty> x <price> = <correct_result> (ghi <total>)"
    • Name unrecognized: "Không nhận diện sản phẩm"
    • Fuzzy match + math wrong: combine both, e.g. "Tính sai: ... | ⚠️ Fuzzy: <original> → <corrected>"
    • Both unrecognized and math wrong: "Tính sai: ... | Không nhận diện sản phẩm"

OUTPUT — exactly this JSON schema:
{
  "items": [ { "item": "...", "quantity": ..., "unit_price": ..., "total": ..., "note": "✅ or ❌ ..." } ],
  "grand_total": <number or null>,
  "summary_note": "<string>",
  "_new_unknowns": ["<original OCR value — rules 5 & 6 only>"],
  "_fuzzy_unknowns": ["<original OCR value — rules 3 & 4 only>"]
}

INPUT JSON to verify:
${JSON.stringify(result, null, 2)}`;
}

type VerifiedRaw = PriceListResult & { _new_unknowns?: string[]; _fuzzy_unknowns?: string[] };

async function verifyAndCorrect(
  result: PriceListResult,
  hints: string[],
  unknowns: UnknownProduct[],
  similarGroups: string[][],
  onDelta?: (delta: StreamDelta) => void,
): Promise<PriceListResult> {
  const input: AgentInput = {
    userPrompt: { text: buildVerificationPrompt(result, hints, unknowns) },
    systemPrompt: VERIFICATION_SYSTEM_PROMPT,
  };

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

  console.log(content);

  logger.info('Price-list verify: model output', { length: content.length });

  const verified = JSON.parse(content) as VerifiedRaw;
  const { _new_unknowns, _fuzzy_unknowns: _unused_fuzzy, ...cleanResult } = verified;

  const correctionMap = new Map(
    unknowns.filter((u) => u.correct_name).map((u) => [u.ocr_name, u.correct_name]),
  );
  const hintMap = new Map(hints.map((h) => [h.toLowerCase(), h]));

  function mathNote(item: PriceListItem): string | null {
    if (item.quantity == null || item.unit_price == null || item.total == null) return null;
    const expected = Math.round(item.quantity * item.unit_price * 100) / 100;
    if (Math.abs(expected - item.total) < 0.01) return null;
    return `Tính sai: ${item.quantity} x ${item.unit_price} = ${expected} (ghi ${item.total})`;
  }

  function similarWarning(name: string): string | null {
    const group = similarGroups.find((g) => g.includes(name));
    return group
      ? ` ⚠️ Lưu ý: ${group.join(' / ')} dễ nhầm lẫn — kiểm tra lại chữ viết tay.`
      : null;
  }

  const codeFuzzyNames: string[] = [];
  cleanResult.items = cleanResult.items.map((item, i) => {
    const originalOcrName = result.items[i]?.item ?? item.item;
    const afterListB =
      correctionMap.get(item.item) ?? correctionMap.get(originalOcrName) ?? item.item;
    const finalName = hintMap.get(afterListB.toLowerCase()) ?? afterListB;

    const wasExactMatch =
      correctionMap.has(originalOcrName) || hintMap.has(originalOcrName.toLowerCase());

    const mathErr = mathNote({ ...item, item: finalName });
    const isRecognized = hints.includes(finalName) || correctionMap.has(originalOcrName);
    const nameErr = isRecognized ? null : 'Không nhận diện sản phẩm';

    const isFuzzy = !wasExactMatch && isRecognized;
    if (isFuzzy) codeFuzzyNames.push(originalOcrName);
    const fuzzyPart = isFuzzy ? `⚠️ Fuzzy: ${originalOcrName} → ${finalName}` : null;

    const errors = [mathErr, nameErr].filter(Boolean).join(' | ');
    let note = errors ? `❌ ${errors}` : '✅';
    if (fuzzyPart) note += ` ${fuzzyPart}`;
    const simWarn = similarWarning(finalName);
    if (simWarn) note += simWarn;

    return { ...item, item: finalName, note };
  });

  const toAdd = [...(_new_unknowns ?? []), ...codeFuzzyNames].filter(
    (name) => !unknowns.some((u) => u.ocr_name === name),
  );

  if (toAdd.length) {
    const updated = [...unknowns, ...toAdd.map((name) => ({ ocr_name: name, correct_name: '' }))];
    await saveProductRefs(hints, updated, similarGroups);
    logger.info('Price-list verify: saved pending products', { count: toAdd.length });
  }

  return cleanResult;
}

// ── First-pass OCR ────────────────────────────────────────────────────────────

function buildInput(imageUrl: string, hints: string[], similarGroups: string[][]): AgentInput {
  const similarNotes = similarGroups
    .map(
      (g) =>
        `Special note: ${g.map((n) => `"${n}"`).join(' and ')} look nearly identical — check the image carefully and preserve the exact spelling as written.`,
    )
    .join('\n');
  const hintText = hints.length
    ? `\n\nThe following is a list of known product names in this price list — use them to correct OCR errors and match items accurately:\n${hints.map((h) => `- ${h}`).join('\n')}\n\n${similarNotes}`
    : '';

  return {
    userPrompt: { image: { url: imageUrl }, text: [INVOICES_TRANSCRIPTION_USER_PROMPT, hintText] },
    systemPrompt: INVOICES_TRANSCRIPTION_SYSTEM_PROMPT,
  };
}

export async function parsePriceListImage(
  imageUrl: string,
  onDelta?: (delta: StreamDelta) => void,
): Promise<PriceListResult> {
  const { hints, unknowns, similarGroups } = await readProductRefs();
  logger.info('Price-list parse: start', {
    imageUrl,
    hints: hints.length,
    unknowns: unknowns.length,
    similarGroups: similarGroups.length,
  });

  const content = await agentCore.run(
    buildInput(imageUrl, hints, similarGroups),
    { requestApproval: async () => false },
    {
      maxTurns: 1,
      onDelta,
      responseFormat: PRICE_LIST_RESPONSE_FORMAT,
      noTools: true,
      temperature: 0,
    },
  );

  console.log(content);

  logger.info('Price-list parse: model output', { length: content.length });

  if (!content) return { items: [], grand_total: null, summary_note: '' };

  let parsed: PriceListResult;
  try {
    parsed = JSON.parse(content) as PriceListResult;
    if (!parsed || !Array.isArray(parsed.items)) throw new Error('Invalid JSON shape');
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

  try {
    return await verifyAndCorrect(parsed, hints, unknowns, similarGroups, onDelta);
  } catch (err) {
    logger.warn('Price-list verify: failed, returning first-pass result', { err: String(err) });
    return parsed;
  }
}
