import { agentCore } from '../../agent/core.js';
import { env } from '../../config/env.js';
import {
  buildInvoiceTranscriptionPrompt,
  buildInvoicesTranscriptionSystemPrompt,
} from '../../prompts/api/invoice-transcription.js';
import type { AgentInput, StreamDelta } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import {
  buildPriceListPromptReferences,
  collectPriceListUnknowns,
  formatPriceListSimilarityWarning,
  readPriceListReferenceStore,
  savePriceListReferenceStore,
  unwrapPriceListJsonContent,
} from './helper/price-list.js';

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

type TranscribedRaw = PriceListResult & {};

export async function parsePriceListImage(
  imageUrl: string,
  onDelta?: (delta: StreamDelta) => void,
): Promise<PriceListResult> {
  const referenceStore = await readPriceListReferenceStore();
  const promptRefs = buildPriceListPromptReferences(referenceStore);
  logger.info('Price-list parse: start', {
    imageUrl,
    canonicalGroups: promptRefs.groups.length,
    referenceEntries: referenceStore.unknowns.length,
    similarGroups: referenceStore.similarGroups.length,
  });

  const content = await agentCore.run(
    {
      userPrompt: {
        image: { url: imageUrl },
        text: buildInvoiceTranscriptionPrompt(promptRefs),
      },
      systemPrompt: buildInvoicesTranscriptionSystemPrompt(),
    },
    { requestApproval: async () => false },
    {
      onDelta,
      responseFormat: { type: 'json_object' },
      noTools: true,
      temperature: 0,
    },
  );

  logger.info('Price-list parse: model output', { length: content.length });

  if (!content) return { items: [], grand_total: null, summary_note: '' };

  let parsed: TranscribedRaw;
  try {
    parsed = JSON.parse(unwrapPriceListJsonContent(content)) as TranscribedRaw;
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
    const { items: parsedItems, ...cleanResult } = parsed;
    const parsedItemNames = parsed.items.map((item) => item.item);
    const updatedUnknowns = [
      ...referenceStore.unknowns,
      ...collectPriceListUnknowns(parsedItemNames, promptRefs.allowedNames),
    ];
    if (updatedUnknowns.length !== referenceStore.unknowns.length) {
      await savePriceListReferenceStore({
        unknowns: updatedUnknowns,
        similarGroups: referenceStore.similarGroups,
      });
    }

    const result = {
      ...cleanResult,
      items: parsedItems.map((item) => ({
        ...item,
        note: [item.note, formatPriceListSimilarityWarning(item.item, referenceStore.similarGroups)]
          .filter(Boolean)
          .join(' | '),
      })),
    };

    return result;
  } catch (err) {
    logger.warn('Price-list parse: post-processing failed, returning model result', {
      err: String(err),
    });
    return parsed;
  }
}
