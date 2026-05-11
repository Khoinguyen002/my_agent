import { tool } from '@openrouter/sdk/lib/tool.js';
import { z } from 'zod/v4';

export const calculatorTool = tool({
  name: 'calculator',
  description: 'Evaluate a mathematical expression. Supports basic arithmetic, parentheses, and common math operations.',
  inputSchema: z.object({
    expression: z.string().describe('A mathematical expression to evaluate, e.g. "2 + 2" or "(3 * 4) / 2"'),
  }),
  execute: async ({ expression }) => {
    if (!/^[\d\s+\-*/().^%]+$/.test(expression)) {
      throw new Error('Invalid expression: only math operators allowed');
    }
    const result = Function(`"use strict"; return (${expression})`)() as unknown;
    return String(result);
  },
});
