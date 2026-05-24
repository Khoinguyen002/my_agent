export type PriceListUnknownProduct = {
  ocr_name: string;
  correct_name: string;
};

export type PriceListPromptReferenceGroup = {
  canonical: string;
  aliases: string[];
};

export type PriceListPromptReferenceData = {
  groups: PriceListPromptReferenceGroup[];
  similarGroups: string[][];
  allowedNames: string[];
};

export type PriceListReferenceStore = {
  unknowns: PriceListUnknownProduct[];
  similarGroups: string[][];
};
