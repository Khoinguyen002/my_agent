# my-agent

A TypeScript CLI agent powered by OpenRouter with Telegram integration, plugable tools, cron scheduling, streaming responses, and reasoning display.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and fill in your values
```

### Required env vars

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `ROUTER_MODEL` | Model for tool selection (e.g. `qwen/qwen3-8b`) |
| `EXECUTOR_MODEL` | Model for final response (e.g. `qwen/qwen3-235b-a22b`) |
| `TELEGRAM_BOT_TOKEN` | Optional — from @BotFather |

## Usage

```bash
# CLI interactive mode
npm run dev

# CLI + Telegram bot (runs both simultaneously)
npm run dev:telegram

# Cron-only mode (no interactive input)
npx tsx src/index.ts -- --cron-only
```

## CLI Commands

```
/new              Start a new conversation
/list             List recent conversations
/load <id>        Load a conversation (partial ID ok)
/cron list        List cron jobs
/cron add         Create a new cron job (interactive)
/cron delete <id> Delete a cron job
/cron enable <id> Enable a cron job
/cron disable <id>Disable a cron job
/cron trigger <id>Manually trigger a cron job now
/tools            List available tools
/help             Show all commands
/exit             Quit
```

You can also manage crons via natural language:
> "Create a cron job that runs every morning at 9am to summarize my tasks"

## Adding Tools

1. Create `src/tools/implementations/my-tool.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types/index.js';

export const myTool: ToolDefinition<{ input: string }> = {
  name: 'my_tool',
  description: 'What this tool does',
  inputSchema: z.object({ input: z.string() }),
  tags: ['my-category'],
  requiresApproval: false,
  execute: async ({ input }) => {
    return { success: true, output: `Processed: ${input}` };
  },
};
```

2. Register in `src/tools/implementations/index.ts`:

```typescript
import { myTool } from './my-tool.js';
// inside registerBuiltinTools():
toolRegistry.register(myTool);
```

## API Server

Set `API_PORT=3000` in `.env` to enable the HTTP API for price-list image OCR.

See **[docs/api.md](docs/api.md)** for full integration guide: endpoint reference, SSE streaming, batch uploads, Drive folder structure, and code examples in JavaScript and Python.

## Architecture

```
User input
  → AgentCore.run()
      → Model 1 (router): picks which tools to call
      → Execute tools in parallel (with approval for sensitive ones)
      → Model 2 (executor): streams final response
  → TerminalRenderer: prints reasoning block + content stream
```

Data is persisted in `./data/`:
- `agent.db` — conversations, messages, user profiles (SQLite)
- `crons.json` — cron job definitions
