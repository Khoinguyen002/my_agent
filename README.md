# my-agent

A TypeScript CLI agent powered by OpenRouter with Telegram integration, pluggable tools, cron scheduling, streaming responses, and reasoning display.

## Features

- 🤖 **AI-Powered Agent** - Powered by OpenRouter with multiple model support
- 💬 **Telegram Integration** - Run as a Telegram bot
- 🔧 **Pluggable Tools** - Easy tool registration and execution
- ⏰ **Cron Scheduling** - Schedule tasks with natural language
- 📡 **Streaming Responses** - Real-time response streaming
- 🧠 **Reasoning Display** - Show AI reasoning process
- 🛡️ **Error Handling** - Comprehensive error handling with custom error classes
- ✅ **Input Validation** - Zod-based input validation
- 📊 **Testing** - 106 tests with Vitest
- 🎨 **Code Quality** - ESLint + Prettier + Pre-commit hooks

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and fill in your values
```

### Required Environment Variables

| Variable             | Description                                     |
| -------------------- | ----------------------------------------------- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key                         |
| `MODEL`              | Model for tool selection (e.g. `qwen/qwen3-8b`) |
| `TELEGRAM_BOT_TOKEN` | Optional — from @BotFather                      |

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

### Endpoints

- `POST /api/price-list` - Upload and parse price list images
- `GET /health` - Health check
- `GET /ready` - Readiness check
- `GET /metrics` - Application metrics

### Rate Limiting

- 100 requests per minute per IP
- Custom error response with retry-after header

### Security Headers

- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

## Development

### Running Tests

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

### Code Quality

```bash
npm run lint                # Check for issues
npm run lint:fix            # Auto-fix issues
npm run format              # Format code
```

### Building

```bash
npm run build               # Build for production
npm start                   # Start production server
```

## Architecture

```
User input
  → AgentCore.run()
      → Validate input (Zod)
      → Model 1 (router): picks which tools to call
      → Execute tools in parallel (with approval for sensitive ones)
      → Model 2 (executor): streams final response
  → TerminalRenderer: prints reasoning block + content stream
```

Data is persisted in `./data/`:

- `agent.db` — conversations, messages, user profiles (SQLite)
- `crons.json` — cron job definitions

## New Modules

### Error Handling

Custom error classes for better error handling:

```typescript
import { ErrorHandler, ValidationError } from './errors/index.js';

try {
  await someOperation();
} catch (error) {
  const appError = ErrorHandler.handle(error, { operation: 'test' });
  console.error(appError.toJSON());
}
```

### Validation

Zod-based input validation:

```typescript
import { validate, UserPromptSchema } from './validation/index.js';

const result = validate(UserPromptSchema, userInput);
if (!result.success) {
  throw new ValidationError('Invalid input', result.errors);
}
```

### Structured Logging

Context-aware logging:

```typescript
import { logger } from './utils/logger.js';

logger.info('User created', { userId: '123', email: 'user@example.com' });
logger.error('Operation failed', { operation: 'createUser' }, error);
```

## Documentation

- [API Documentation](docs/api.md) - API endpoint reference

## License

MIT
