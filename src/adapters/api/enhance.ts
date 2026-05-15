import sharp from 'sharp';

export type EnhanceResult = {
  buffer: Buffer;
  mimeType: string;
};

/**
 * Enhance a handwritten price-list image for better OCR accuracy:
 * 1. Grayscale  — removes color noise
 * 2. Normalize  — stretches histogram to full dynamic range (lifts faint ink)
 * 3. Sharpen    — crisps text edges
 * 4. PNG output — lossless, so the model gets the cleanest possible pixels
 */
export async function enhanceImage(input: Buffer): Promise<EnhanceResult> {
  const buffer = await sharp(input)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { buffer, mimeType: 'image/png' };
}
