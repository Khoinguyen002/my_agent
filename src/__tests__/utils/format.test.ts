import { describe, it, expect } from 'vitest';
import { truncate, formatDate, sleep, parseProvidersString } from '../../utils/format.js';

describe('format utils', () => {
  describe('truncate', () => {
    it('should return string unchanged if shorter than maxLen', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should return string unchanged if equal to maxLen', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });

    it('should truncate string if longer than maxLen', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should use default maxLen of 80', () => {
      const longStr = 'a'.repeat(100);
      expect(truncate(longStr)).toBe(`${'a'.repeat(77)}...`);
    });

    it('should handle empty string', () => {
      expect(truncate('', 5)).toBe('');
    });
  });

  describe('formatDate', () => {
    it('should format timestamp to readable date string', () => {
      const timestamp = new Date('2024-01-15T12:00:00Z').getTime();
      const result = formatDate(timestamp);
      expect(result).toContain('2024');
    });

    it('should handle current timestamp', () => {
      const now = Date.now();
      const result = formatDate(now);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('sleep', () => {
    it('should resolve after specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some variance
    });

    it('should resolve immediately for 0ms', async () => {
      const start = Date.now();
      await sleep(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('parseProvidersString', () => {
    it('should return undefined for undefined input', () => {
      expect(parseProvidersString(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(parseProvidersString('')).toBeUndefined();
    });

    it('should parse single provider without quantization', () => {
      const result = parseProvidersString('deepinfra');
      expect(result).toEqual({
        order: ['DeepInfra'],
        allowFallbacks: true,
        quantizations: [],
      });
    });

    it('should parse single provider with quantization', () => {
      const result = parseProvidersString('deepinfra/bf16');
      expect(result).toEqual({
        order: ['DeepInfra'],
        allowFallbacks: true,
        quantizations: ['bf16'],
      });
    });

    it('should parse multiple providers', () => {
      const result = parseProvidersString('deepinfra, together');
      expect(result).toEqual({
        order: ['DeepInfra', 'Together'],
        allowFallbacks: true,
        quantizations: [],
      });
    });

    it('should handle case-insensitive provider names', () => {
      const result = parseProvidersString('DEEPINFRA');
      expect(result?.order).toEqual(['DeepInfra']);
    });

    it('should preserve unknown provider names', () => {
      const result = parseProvidersString('custom-provider');
      expect(result?.order).toEqual(['custom-provider']);
    });
  });
});
