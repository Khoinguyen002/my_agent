import { z } from 'zod';

/**
 * User prompt schema
 */
export const UserPromptSchema = z.object({
  text: z
    .string()
    .min(1, 'Prompt text is required')
    .max(10000, 'Prompt text must be less than 10000 characters')
    .trim(),
  image: z.string().url('Image must be a valid URL').optional(),
});

/**
 * Message schema
 */
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().min(1, 'Message content is required'),
  tool_call_id: z.string().optional(),
  tool_name: z.string().optional(),
  tool_calls_json: z.string().optional(),
  reasoning_content: z.string().optional(),
});

/**
 * Agent input schema
 */
export const AgentInputSchema = z.object({
  userPrompt: UserPromptSchema,
  systemPrompt: z.string().optional(),
  history: z.array(MessageSchema).optional(),
});

/**
 * Tool input validation schema
 */
export const ToolInputSchema = z.record(z.unknown());

/**
 * Conversation schema
 */
export const ConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  source: z.enum(['cli', 'telegram', 'cron']),
  telegram_chat_id: z.number().optional(),
  cron_job_id: z.string().optional(),
  created_at: z.number().int().positive(),
  updated_at: z.number().int().positive(),
});

/**
 * User profile schema
 */
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  source: z.enum(['cli', 'telegram']),
  source_id: z.string().min(1),
  expectations: z.string().optional(),
  onboarded_at: z.number().int().positive(),
  created_at: z.number().int().positive(),
});

/**
 * Cron job schema
 */
export const CronJobSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  schedule: z.string().min(1),
  prompt: z.string().min(1),
  conversation_id: z.string().uuid(),
  enabled: z.boolean(),
  created_at: z.number().int().positive(),
  updated_at: z.number().int().positive(),
});

/**
 * API request schemas
 */
export const ApiRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  path: z.string().min(1),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  query: z.record(z.string()).optional(),
});

/**
 * Image upload schema
 */
export const ImageUploadSchema = z.object({
  filename: z.string().min(1),
  mimetype: z.string().regex(/^image\/(jpeg|png|gif|webp)$/),
  size: z.number().max(10 * 1024 * 1024), // 10MB max
});

/**
 * Price list item schema
 */
export const PriceListItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  currency: z.string().length(3),
  description: z.string().optional(),
  category: z.string().optional(),
});

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodError['issues'] };

/**
 * Validate data against schema
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.issues };
}

/**
 * Validate and throw on error
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

/**
 * Sanitize object input
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (typeof sanitized[key] === 'string') {
      (sanitized as Record<string, unknown>)[key] = sanitizeString(sanitized[key] as string);
    }
  }

  return sanitized;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate cron expression
 */
export function isValidCronExpression(expression: string): boolean {
  const cronRegex =
    /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])-([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])|([0-9]|1[0-9]|2[0-3])-([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])|([1-9]|1[0-9]|2[0-9]|3[0-1])-([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])|([1-9]|1[0-2])-([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6])|([0-6])-([0-6]))$/;
  return cronRegex.test(expression);
}
