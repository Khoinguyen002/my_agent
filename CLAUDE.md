# CLAUDE.md - Project Instructions

## Project Overview

My Agent is a TypeScript CLI agent powered by OpenRouter with Telegram integration, pluggable tools, cron scheduling, streaming responses, and reasoning display.

## Tech Stack

- **Runtime:** Node.js 18+ with ESM modules
- **Language:** TypeScript 5.5+
- **Database:** SQLite via better-sqlite3
- **HTTP Server:** Fastify 5
- **Telegram:** grammy
- **Validation:** Zod
- **Testing:** Vitest
- **Linting:** ESLint + Prettier
- **Git Hooks:** Husky + lint-staged

## Common Commands

```bash
# Development
npm run dev              # Start CLI interactive mode
npm run dev:telegram     # Start CLI + Telegram bot
npm run dev:watch        # Watch mode with auto-restart

# Production
npm run build            # Build TypeScript
npm start                # Start production server
npm run start:telegram   # Start with Telegram

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage

# Code Quality
npm run lint             # Check for issues
npm run lint:fix         # Auto-fix issues
npm run format           # Format code
```

## Architecture

```
User Input (CLI/Telegram/API)
  → AgentCore.run()
      → Validate input (Zod)
      → Model 1 (router): picks which tools to call
      → Execute tools in parallel (with approval for sensitive ones)
      → Model 2 (executor): streams final response
  → Output Layer: TerminalRenderer / Telegram / HTTP Response
```

## Key Patterns

### Tool Registration

Tools are in `src/tools/implementations/`. Each tool:

- Uses Zod schema for input validation
- Returns `{ success: boolean, output: string }`
- Registers via `toolRegistry.register()`

### Error Handling

Use custom error classes from `src/errors/`:

- `ValidationError` (400)
- `ModelError` (502)
- `DatabaseError` (500)
- `ToolError` (500)

Always use `ErrorHandler.handle()` to wrap errors.

### Validation

All input validated with Zod schemas in `src/validation/schemas.ts`.

Use `validate()` for safe validation or `validateOrThrow()` to throw on error.

### Database

SQLite with WAL mode. Tables:

- `conversations` - Chat sessions
- `messages` - Chat messages
- `user_profiles` - User info

Operations in `src/db/conversations.ts` and `src/db/users.ts`.

### Logging

Use structured logger from `src/utils/logger.ts`:

```typescript
logger.info('message', { key: 'value' });
logger.error('error', { context }, error);
```

## File Structure

```
src/
├── index.ts           # Entry point
├── agent/             # Core agent logic
├── adapters/          # CLI, Telegram, API adapters
├── config/            # Environment config
├── cron/              # Cron scheduling
├── db/                # Database layer
├── errors/            # Error classes
├── llm/               # LLM integration
├── prompts/           # Prompt templates
├── tools/             # Tool system
├── types/             # TypeScript types
├── utils/             # Utilities
├── validation/        # Zod schemas
└── __tests__/         # Tests
```

## Important Notes

- **ESM Only:** Use `import` not `require`. File extensions `.js` required in imports.
- **Async/Await:** All async operations use proper error handling.
- **Tool Approval:** Sensitive tools require `requestApproval()` flow.
- **Streaming:** Use `onDelta` callback for real-time output.
- **Cron Jobs:** Stored in `./data/crons.json`, persisted across restarts.

## Environment Variables

Required:

- `OPENROUTER_API_KEY` - OpenRouter API key
- `MODEL` - Model ID (e.g., `qwen/qwen3-8b`)

Optional:

- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `API_PORT` - HTTP API port
- `DATA_DIR` - Data directory (default: `./data`)

See `src/config/env.ts` for full list.

## Testing

Tests in `src/__tests__/`. Run with:

```bash
npm test
```

Coverage includes:

- Validation schemas
- Error handling
- Tool registry
- Utility functions
