import { describe, it, expect } from 'vitest';
import {
  UserPromptSchema,
  MessageSchema,
  AgentInputSchema,
  validate,
  validateOrThrow,
  sanitizeString,
  sanitizeObject,
  isValidEmail,
  isValidUrl,
  isValidCronExpression,
} from '../../validation/schemas.js';

describe('Validation Schemas', () => {
  describe('UserPromptSchema', () => {
    it('should validate valid prompt', () => {
      const result = UserPromptSchema.safeParse({ text: 'Hello, world!' });
      expect(result.success).toBe(true);
    });

    it('should reject empty text', () => {
      const result = UserPromptSchema.safeParse({ text: '' });
      expect(result.success).toBe(false);
    });

    it('should reject text exceeding max length', () => {
      const longText = 'a'.repeat(10001);
      const result = UserPromptSchema.safeParse({ text: longText });
      expect(result.success).toBe(false);
    });

    it('should accept valid image URL', () => {
      const result = UserPromptSchema.safeParse({
        text: 'Hello',
        image: 'https://example.com/image.jpg',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid image URL', () => {
      const result = UserPromptSchema.safeParse({
        text: 'Hello',
        image: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MessageSchema', () => {
    it('should validate valid message', () => {
      const result = MessageSchema.safeParse({
        role: 'user',
        content: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = MessageSchema.safeParse({
        role: 'invalid',
        content: 'Hello',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty content', () => {
      const result = MessageSchema.safeParse({
        role: 'user',
        content: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AgentInputSchema', () => {
    it('should validate valid agent input', () => {
      const result = AgentInputSchema.safeParse({
        userPrompt: { text: 'Hello' },
      });
      expect(result.success).toBe(true);
    });

    it('should validate with history', () => {
      const result = AgentInputSchema.safeParse({
        userPrompt: { text: 'Hello' },
        history: [
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid history', () => {
      const result = AgentInputSchema.safeParse({
        userPrompt: { text: 'Hello' },
        history: [{ role: 'invalid', content: 'Message' }],
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Validation Functions', () => {
  describe('validate', () => {
    it('should return success for valid data', () => {
      const result = validate(UserPromptSchema, { text: 'Hello' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.text).toBe('Hello');
      }
    });

    it('should return errors for invalid data', () => {
      const result = validate(UserPromptSchema, { text: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateOrThrow', () => {
    it('should return data for valid input', () => {
      const data = validateOrThrow(UserPromptSchema, { text: 'Hello' });
      expect(data.text).toBe('Hello');
    });

    it('should throw for invalid input', () => {
      expect(() => {
        validateOrThrow(UserPromptSchema, { text: '' });
      }).toThrow();
    });
  });
});

describe('Sanitization Functions', () => {
  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });

    it('should remove javascript: protocol', () => {
      expect(sanitizeString('javascript:alert("xss")')).toBe('alert("xss")');
    });

    it('should remove event handlers', () => {
      expect(sanitizeString('onclick=alert("xss")')).toBe('alert("xss")');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values', () => {
      const input = { name: '  John  ', age: 30 };
      const result = sanitizeObject(input);
      expect(result.name).toBe('John');
      expect(result.age).toBe(30);
    });

    it('should not modify non-string values', () => {
      const input = { count: 5, active: true };
      const result = sanitizeObject(input);
      expect(result.count).toBe(5);
      expect(result.active).toBe(true);
    });
  });
});

describe('Validation Utilities', () => {
  describe('isValidEmail', () => {
    it('should validate correct email', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URL', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('should reject invalid URL', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('isValidCronExpression', () => {
    it('should validate correct cron expressions', () => {
      expect(isValidCronExpression('* * * * *')).toBe(true);
      expect(isValidCronExpression('0 9 * * 1-5')).toBe(true);
      expect(isValidCronExpression('*/5 * * * *')).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      expect(isValidCronExpression('invalid')).toBe(false);
      expect(isValidCronExpression('* * *')).toBe(false);
    });
  });
});
