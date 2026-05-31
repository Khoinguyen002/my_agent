import { env } from '../../../config/env.js';
import { findOrCreateSheet, readSheetValues, writeSheetValues } from '../drive.js';
import type {
  PriceListPromptReferenceData,
  PriceListReferenceStore,
  PriceListUnknownProduct,
} from '../types/price-list-types.js';

const REFS_SHEET_NAME = 'price-list-references';

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function parseReferenceSheet(values: string[][]): PriceListReferenceStore {
  if (!values.length) {
    return { unknowns: [], similarGroups: [] };
  }

  const sheetRows = values[0]?.[0] === 'Hints' ? values.slice(1) : values;
  const ocrHeaderIdx = sheetRows.findIndex((row) => row[0] === 'ocr_name');
  const similarRows = ocrHeaderIdx >= 0 ? sheetRows.slice(0, ocrHeaderIdx) : [];
  const dataRows = ocrHeaderIdx >= 0 ? sheetRows.slice(ocrHeaderIdx + 1) : sheetRows;

  const similarGroups = similarRows
    .filter((row) => row[0] === 'similar_group')
    .map((row) => row.slice(1).filter(Boolean));

  const unknowns = dataRows.flatMap(([ocr_name = '', correct_name = '']) =>
    ocr_name ? [{ ocr_name, correct_name }] : [],
  );

  return { unknowns, similarGroups };
}

function serializeReferenceSheet(store: PriceListReferenceStore): string[][] {
  return [
    ...store.similarGroups.map((group) => ['similar_group', ...group]),
    ['ocr_name', 'correct_name'],
    ...store.unknowns.map((unknown) => [unknown.ocr_name, unknown.correct_name]),
  ];
}

export async function readPriceListReferenceStore(): Promise<PriceListReferenceStore> {
  const folderId = env.driveFolderId;
  if (!folderId) {
    return { unknowns: [], similarGroups: [] };
  }

  try {
    const sheetId = await findOrCreateSheet(REFS_SHEET_NAME, folderId);
    const values = await readSheetValues(sheetId);
    return parseReferenceSheet(values);
  } catch {
    return { unknowns: [], similarGroups: [] };
  }
}

export async function savePriceListReferenceStore(store: PriceListReferenceStore): Promise<void> {
  const folderId = env.driveFolderId;
  if (!folderId) {
    return;
  }

  const sheetId = await findOrCreateSheet(REFS_SHEET_NAME, folderId);
  await writeSheetValues(sheetId, serializeReferenceSheet(store));
}

export function buildPriceListPromptReferences(
  store: PriceListReferenceStore,
): PriceListPromptReferenceData {
  const { unknowns, similarGroups } = store;
  const canonicalNames = uniqueStrings(
    unknowns.map((entry) => normalizeText(entry.correct_name)).filter(Boolean),
  );
  const aliasesByCanonical = new Map<string, string[]>();

  for (const canonical of canonicalNames) {
    aliasesByCanonical.set(canonical, []);
  }

  for (const unknown of unknowns) {
    const alias = normalizeText(unknown.ocr_name);
    const canonical = normalizeText(unknown.correct_name);

    if (!alias || !canonical) {
      continue;
    }

    if (!aliasesByCanonical.has(canonical)) {
      aliasesByCanonical.set(canonical, []);
      canonicalNames.push(canonical);
    }

    const aliases = aliasesByCanonical.get(canonical) ?? [];
    if (alias !== canonical && !aliases.includes(alias)) {
      aliases.push(alias);
    }
    aliasesByCanonical.set(canonical, aliases);
  }

  return {
    groups: canonicalNames.map((canonical) => ({
      canonical,
      aliases: aliasesByCanonical.get(canonical) ?? [],
    })),
    similarGroups,
    allowedNames: uniqueStrings([
      ...canonicalNames,
      ...similarGroups.map((group) => group[0] ?? ''),
    ]),
  };
}

export function formatPriceListSimilarityWarning(
  name: string,
  similarGroups: string[][],
): string | null {
  const group = similarGroups.find((entry) => entry.includes(name));
  return group ? ` ⚠️ Lưu ý: ${group.join(' / ')} dễ nhầm lẫn — kiểm tra lại chữ viết tay.` : null;
}

export function unwrapPriceListJsonContent(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

export function collectPriceListUnknowns(
  itemNames: string[],
  allowedNames: string[],
): PriceListUnknownProduct[] {
  const allowed = new Set(uniqueStrings(allowedNames));
  const seen = new Set<string>();
  const unknowns: PriceListUnknownProduct[] = [];

  for (const itemName of itemNames) {
    const normalized = normalizeText(itemName);
    if (!normalized || allowed.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unknowns.push({ ocr_name: normalized, correct_name: '' });
  }

  return unknowns;
}
