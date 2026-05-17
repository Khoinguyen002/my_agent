import { agentCore } from '../../agent/core.js';
import { env } from '../../config/env.js';
import {
  buildInvoiceTranscriptionPrompt,
  buildInvoicesTranscriptionSystemPrompt,
} from '../../prompts/api/invoice-transcription.js';
import {
  buildVerificationPrompt,
  buildVerificationSystemPrompt,
} from '../../prompts/api/invoice-verification.js';
import type { AgentInput, StreamDelta } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
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
    systemPrompt: buildVerificationSystemPrompt(),
  };

  const content = await agentCore.run(
    input,
    { requestApproval: async () => false },
    {
      maxTurns: 1,
      onDelta,
      responseFormat: { type: 'json_object' },
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
    const qty = item.quantity;
    const price = item.unit_price;
    const total = item.total;
    if (qty == null || price == null || total == null) return null;
    const expected = Math.round(qty * price * 100) / 100;
    if (Math.abs(expected - total) < 0.01) return null;
    return `Tính sai: ${qty} x ${price} = ${expected} (ghi ${total})`;
  }

  function similarWarning(name: string): string | null {
    const group = similarGroups.find((g) => g.includes(name));
    return group
      ? ` ⚠️ Lưu ý: ${group.join(' / ')} dễ nhầm lẫn — kiểm tra lại chữ viết tay.`
      : null;
  }

  cleanResult.grand_total = cleanResult.grand_total;

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
    userPrompt: { image: { url: imageUrl }, text: [buildInvoiceTranscriptionPrompt(), hintText] },
    systemPrompt: buildInvoicesTranscriptionSystemPrompt(),
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
      responseFormat: { type: 'json_object' },
      noTools: true,
      temperature: 0,
    },
  );

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
