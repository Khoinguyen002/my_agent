# Tool Development Guide

## Overview

The tool system allows you to extend the agent's capabilities with custom functions. Tools are registered in the `ToolRegistry` and can be called by the AI model during conversations.

## Tool Structure

Each tool consists of:

1. **Name** — Unique identifier
2. **Description** — What the tool does
3. **Input Schema** — Zod schema for validation
4. **Tags** — Categories for organization
5. **Requires Approval** — Whether user approval is needed
6. **Execute Function** — The actual logic

## Creating a Tool

### Step 1: Create the Tool File

Create a new file in `src/tools/implementations/`:

```typescript
// src/tools/implementations/my-tool.ts
import { z } from 'zod';
import type { ToolDefinition } from '../../types/index.js';

/**
 * My custom tool
 * Does something useful with the input
 */
export const myTool: ToolDefinition<{ input: string; count: number }> = {
  name: 'my_tool',
  description: 'A brief description of what this tool does',
  inputSchema: z.object({
    input: z.string().describe('The input to process'),
    count: z.number().int().positive().describe('Number of times to process'),
  }),
  tags: ['my-category', 'utility'],
  requiresApproval: false,

  execute: async ({ input, count }) => {
    try {
      // Your tool logic here
      const result = input.repeat(count);

      return {
        success: true,
        output: `Processed ${count} times: ${result}`,
      };
    } catch (error) {
      return {
        success: false,
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

### Step 2: Register the Tool

Add the tool to `src/tools/implementations/index.ts`:

```typescript
import { myTool } from './my-tool.js';

export function registerBuiltinTools(): void {
  // ... existing tools
  toolRegistry.register(myTool);
}
```

## Tool Definition Interface

```typescript
interface ToolDefinition<TInput> {
  /** Unique tool name (snake_case) */
  name: string;

  /** Description for the AI model */
  description: string;

  /** Zod schema for input validation */
  inputSchema: z.ZodType<TInput>;

  /** Categories for organization */
  tags?: string[];

  /** Whether user approval is required before execution */
  requiresApproval?: boolean;

  /** Context schema for SDK context injection */
  contextSchema?: z.ZodType<Record<string, unknown>>;

  /** The execution function */
  execute: (input: TInput, context?: ToolContext) => Promise<ToolResult>;
}

interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;

  /** Output text to return to the model */
  output: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

interface ToolContext {
  /** Current conversation ID */
  conversationId?: string;

  /** Function to request user approval */
  requestApproval: (description: string) => Promise<boolean>;
}
```

## Best Practices

### 1. Clear Descriptions

Write descriptions that help the AI model understand when to use the tool:

```typescript
// ❌ Bad
description: 'Processes data';

// ✅ Good
description: 'Calculates the mathematical expression and returns the result. Supports basic arithmetic, exponents, and common math functions.';
```

### 2. Input Validation

Use Zod schemas with descriptive messages:

```typescript
inputSchema: z.object({
  email: z.string().email('Must be a valid email address'),
  count: z.number().int().min(1).max(100).describe('Number of items (1-100)'),
});
```

### 3. Error Handling

Always return structured results, never throw:

```typescript
execute: async (input) => {
  try {
    const result = await riskyOperation(input);
    return { success: true, output: result };
  } catch (error) {
    return {
      success: false,
      output: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};
```

### 4. Approval Flow

For sensitive operations, require approval:

```typescript
export const deleteFileTool: ToolDefinition<{ path: string }> = {
  name: 'delete_file',
  description: 'Delete a file from the filesystem',
  inputSchema: z.object({ path: z.string() }),
  requiresApproval: true,

  execute: async ({ path }, context) => {
    if (!context) {
      return { success: false, output: 'Context required for approval' };
    }

    const approved = await context.requestApproval(`Delete file: ${path}`);

    if (!approved) {
      return { success: false, output: 'Operation cancelled by user' };
    }

    // Perform deletion
    await fs.unlink(path);
    return { success: true, output: `Deleted: ${path}` };
  },
};
```

### 5. Tags

Use tags to categorize tools:

```typescript
tags: ['file-system', 'write']; // For file operations
tags: ['network', 'http']; // For network operations
tags: ['data', 'transform']; // For data processing
```

## Built-in Tools Reference

### calculator

Evaluates mathematical expressions.

```typescript
{
  name: 'calculator',
  description: 'Evaluate mathematical expressions',
  inputSchema: z.object({
    expression: z.string().describe('Mathematical expression to evaluate'),
  }),
  tags: ['math', 'utility'],
  requiresApproval: false,
}
```

**Example:**

```
Input: { expression: "2 + 2 * 3" }
Output: { success: true, output: "8" }
```

### cron_create

Creates a new cron job.

```typescript
{
  name: 'cron_create',
  description: 'Create a new scheduled cron job',
  inputSchema: z.object({
    name: z.string().describe('Name of the cron job'),
    schedule: z.string().describe('Cron expression (e.g., "0 9 * * *")'),
    prompt: z.string().describe('Prompt to execute'),
  }),
  tags: ['cron', 'scheduling'],
  requiresApproval: false,
}
```

### cron_list

Lists all cron jobs.

```typescript
{
  name: 'cron_list',
  description: 'List all configured cron jobs',
  inputSchema: z.object({}),
  tags: ['cron', 'scheduling'],
  requiresApproval: false,
}
```

### cron_delete

Deletes a cron job.

```typescript
{
  name: 'cron_delete',
  description: 'Delete a cron job by ID',
  inputSchema: z.object({
    id: z.string().describe('ID of the cron job to delete'),
  }),
  tags: ['cron', 'scheduling'],
  requiresApproval: false,
}
```

### telegram_send

Sends a message via Telegram.

```typescript
{
  name: 'telegram_send',
  description: 'Send a message to a Telegram chat',
  inputSchema: z.object({
    chatId: z.number().describe('Telegram chat ID'),
    message: z.string().describe('Message to send'),
  }),
  tags: ['telegram', 'messaging'],
  requiresApproval: false,
}
```

## Advanced Features

### Context Injection

Use `contextSchema` to inject per-tool context:

```typescript
export const myTool: ToolDefinition<{ input: string }> = {
  name: 'my_tool',
  description: 'Tool with context',
  inputSchema: z.object({ input: z.string() }),
  contextSchema: z.object({
    userId: z.string(),
    permissions: z.array(z.string()),
  }),

  execute: async (input, context) => {
    // Access SDK context via context.sdkContext
    return { success: true, output: 'Done' };
  },
};
```

### Streaming Output

For long-running tools, use the `onDelta` callback:

```typescript
execute: async (input, context) => {
  // For streaming, use onDelta from context
  // This is handled at a higher level

  // Simulate long operation
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return { success: true, output: 'Completed' };
};
```

### Tool Dependencies

If a tool depends on external services, handle failures gracefully:

```typescript
execute: async (input) => {
  try {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) {
      return {
        success: false,
        output: `API error: ${response.status} ${response.statusText}`,
      };
    }
    const data = await response.json();
    return { success: true, output: JSON.stringify(data) };
  } catch (error) {
    return {
      success: false,
      output: `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
};
```

## Testing Tools

Write tests for your tools:

```typescript
import { describe, it, expect } from 'vitest';
import { myTool } from '../tools/implementations/my-tool.js';

describe('myTool', () => {
  it('should process input correctly', async () => {
    const result = await myTool.execute({
      input: 'hello',
      count: 3,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('hellohellohello');
  });

  it('should handle errors gracefully', async () => {
    const result = await myTool.execute({
      input: '',
      count: -1,
    });

    expect(result.success).toBe(false);
  });
});
```

## Debugging Tools

Enable debug logging to see tool execution:

```bash
DEBUG=* npm run dev
```

This will show:

- Tool registration
- Tool selection by the model
- Tool execution results
- Errors and timeouts
