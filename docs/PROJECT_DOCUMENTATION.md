# My Agent — Complete Project Documentation

> A TypeScript CLI agent powered by OpenRouter with Telegram integration, pluggable tools, cron scheduling, streaming responses, and reasoning display.

**Version:** 1.0.0  
**License:** MIT

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Configuration](#configuration)
5. [Core Components](#core-components)
6. [Adapters](#adapters)
7. [Tools System](#tools-system)
8. [Database Layer](#database-layer)
9. [Cron Scheduling](#cron-scheduling)
10. [Error Handling](#error-handling)
11. [Validation](#validation)
12. [Logging](#logging)
13. [Testing](#testing)
14. [API Reference](#api-reference)
15. [Development Guide](#development-guide)
16. [Troubleshooting](#troubleshooting)

---

## Overview

**My Agent** is a modular, extensible AI agent framework built in TypeScript. It provides multiple interfaces (CLI, Telegram, HTTP API) to interact with AI models via OpenRouter, with support for:

- **Multi-model support**: OpenRouter, Xiaomi MiMo, OpenAI-compatible providers
- **Pluggable tool system**: Register custom tools with Zod-validated inputs
- **Cron scheduling**: Schedule recurring AI tasks with natural language
- **Streaming responses**: Real-time output with reasoning display
- **Persistent storage**: SQLite-based conversation and user management
- **Input validation**: Comprehensive Zod-based validation
- **Error handling**: Custom error classes with structured logging

### Key Features

| Feature                 | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| 🤖 AI-Powered Agent     | Powered by OpenRouter with multiple model support        |
| 💬 Telegram Integration | Run as a Telegram bot with permission controls           |
| 🔧 Pluggable Tools      | Easy tool registration and execution                     |
| ⏰ Cron Scheduling      | Schedule tasks with natural language or cron expressions |
| 📡 Streaming Responses  | Real-time response streaming                             |
| 🧠 Reasoning Display    | Show AI reasoning process                                |
| 🛡️ Error Handling       | Comprehensive error handling with custom error classes   |
| ✅ Input Validation     | Zod-based input validation                               |
| 📊 Testing              | 106 tests with Vitest                                    |
| 🎨 Code Quality         | ESLint + Prettier + Pre-commit hooks                     |

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                           │
│              (CLI / Telegram / HTTP API)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    AgentCore.run()                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. Validate input (Zod)                               │  │
│  │ 2. Register available tools                           │  │
│  │ 3. Call AI model (router)                             │  │
│  │ 4. Execute tools in parallel                          │  │
│  │ 5. Call AI model (executor) with tool results         │  │
│  │ 6. Stream response back                               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Output Layer                             │
│         (TerminalRenderer / Telegram / HTTP Response)       │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
my_agent/
├── src/
│   ├── index.ts                 # Application entry point
│   ├── agent/                   # Core agent logic
│   │   ├── core.ts              # AgentCore class
│   │   ├── session.ts           # Session management
│   │   └── onboarding.ts        # CLI onboarding flow
│   ├── adapters/                # Interface adapters
│   │   ├── cli/                 # CLI adapter
│   │   │   ├── repl.ts          # REPL interface
│   │   │   ├── commands.ts      # Command handlers
│   │   │   └── renderer.ts      # Terminal renderer
│   │   ├── telegram/            # Telegram adapter
│   │   │   ├── bot.ts           # Bot setup
│   │   │   ├── handlers.ts      # Message handlers
│   │   │   └── permissions.ts   # Permission system
│   │   └── api/                 # HTTP API adapter
│   │       ├── server.ts        # Fastify server
│   │       ├── price-list.ts    # Price list OCR
│   │       ├── drive.ts         # Google Drive integration
│   │       ├── enhance.ts       # Image enhancement
│   │       └── queue.ts         # Job queue
│   ├── config/                  # Configuration
│   │   └── env.ts               # Environment variables
│   ├── cron/                    # Cron scheduling
│   │   ├── manager.ts           # CronManager class
│   │   └── store.ts             # Cron persistence
│   ├── db/                      # Database layer
│   │   ├── client.ts            # SQLite setup
│   │   ├── conversations.ts     # Conversation operations
│   │   ├── users.ts             # User operations
│   │   └── utils/               # DB utilities
│   ├── errors/                  # Error handling
│   │   ├── index.ts             # Error exports
│   │   ├── base.ts              # Base error classes
│   │   └── handler.ts           # ErrorHandler
│   ├── llm/                     # LLM integration
│   │   ├── client.ts            # OpenRouter client
│   │   ├── model.ts             # Model call routing
│   │   ├── xiaomi-model.ts      # Xiaomi MiMo integration
│   │   ├── openai-model.ts      # OpenAI-compatible integration
│   │   ├── wrapTool.ts          # Tool wrapping
│   │   ├── helpers/             # LLM helpers
│   │   └── types/               # LLM types
│   ├── prompts/                 # Prompt templates
│   │   └── utils/index.ts       # Prompt utilities
│   ├── tools/                   # Tool system
│   │   ├── registry.ts          # ToolRegistry class
│   │   └── implementations/     # Built-in tools
│   │       ├── calculator.ts    # Calculator tool
│   │       ├── cron-manager.ts  # Cron management tools
│   │       └── telegram-send.ts # Telegram send tool
│   ├── types/                   # TypeScript types
│   │   └── index.ts             # Core types
│   ├── utils/                   # Utilities
│   │   ├── format.ts            # Formatting utilities
│   │   ├── history.ts           # History management
│   │   └── logger.ts            # Structured logger
│   ├── validation/              # Input validation
│   │   ├── index.ts             # Validation exports
│   │   └── schemas.ts           # Zod schemas
│   └── __tests__/               # Test suite
│       ├── errors/              # Error tests
│       ├── tools/               # Tool tests
│       ├── utils/               # Utility tests
│       └── validation/          # Validation tests
├── docs/                        # Documentation
├── data/                        # Data directory (SQLite, crons)
├── .husky/                      # Git hooks
├── vitest.config.ts             # Vitest configuration
├── tsconfig.json                # TypeScript configuration
├── eslint.config.js             # ESLint configuration
└── package.json                 # Project configuration
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **OpenRouter API Key** (get from [openrouter.ai](https://openrouter.ai))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd my_agent

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Quick Start

```bash
# Start CLI interactive mode
npm run dev

# Start CLI + Telegram bot
npm run dev:telegram

# Start in cron-only mode (no interactive input)
npx tsx src/index.ts -- --cron-only
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Required
OPENROUTER_API_KEY=your_openrouter_api_key_here
MODEL=qwen/qwen3-8b

# Optional - Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Optional - API Server
API_PORT=3000

# Optional - Data Directory
DATA_DIR=./data

# Optional - Output Limits
MAX_OUTPUT_TOKENS=4096

# Optional - Google OAuth (for Drive integration)
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REFRESH_TOKEN=your_refresh_token
DRIVE_FOLDER_ID=your_folder_id
DRIVE_PUBLIC=1

# Optional - Xiaomi MiMo (alternative to OpenRouter)
XIAOMI_API_KEY=your_xiaomi_key
XIAOMI_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
XIAOMI_MODEL=your_model_name

# Optional - OpenAI-Compatible Provider
OPENAI_COMPAT_API_KEY=your_key
OPENAI_COMPAT_BASE_URL=your_base_url
OPENAI_COMPAT_MODEL=your_model

# Optional - Context Compression
CONTEXT_COMPRESSION=0

# Optional - CORS Origins (comma-separated)
CORS_ORIGINS=https://app.example.com,http://localhost:5173

# Optional - Provider Selection
PROVIDERS=deepinfra/bf16
```

### Environment Variable Reference

| Variable                     | Required | Default                                    | Description                             |
| ---------------------------- | -------- | ------------------------------------------ | --------------------------------------- |
| `OPENROUTER_API_KEY`         | Yes      | -                                          | Your OpenRouter API key                 |
| `MODEL`                      | Yes      | -                                          | Model ID (e.g., `qwen/qwen3-8b`)        |
| `TELEGRAM_BOT_TOKEN`         | No       | -                                          | Telegram bot token from @BotFather      |
| `API_PORT`                   | No       | `0`                                        | HTTP API port (0 = disabled)            |
| `DATA_DIR`                   | No       | `./data`                                   | Data directory path                     |
| `MAX_OUTPUT_TOKENS`          | No       | `4096`                                     | Maximum output tokens                   |
| `GOOGLE_OAUTH_CLIENT_ID`     | No       | -                                          | Google OAuth client ID                  |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No       | -                                          | Google OAuth client secret              |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | No       | -                                          | Google OAuth refresh token              |
| `DRIVE_FOLDER_ID`            | No       | -                                          | Google Drive folder ID                  |
| `DRIVE_PUBLIC`               | No       | `1`                                        | Make Drive files public (`1` or `0`)    |
| `XIAOMI_API_KEY`             | No       | -                                          | Xiaomi MiMo API key                     |
| `XIAOMI_BASE_URL`            | No       | `https://token-plan-sgp.xiaomimimo.com/v1` | Xiaomi MiMo base URL                    |
| `XIAOMI_MODEL`               | No       | -                                          | Xiaomi MiMo model name                  |
| `OPENAI_COMPAT_API_KEY`      | No       | -                                          | OpenAI-compatible API key               |
| `OPENAI_COMPAT_BASE_URL`     | No       | -                                          | OpenAI-compatible base URL              |
| `OPENAI_COMPAT_MODEL`        | No       | -                                          | OpenAI-compatible model name            |
| `CONTEXT_COMPRESSION`        | No       | `0`                                        | Enable context compression (`1` or `0`) |
| `CORS_ORIGINS`               | No       | -                                          | Comma-separated CORS origins            |
| `PROVIDERS`                  | No       | -                                          | Provider selection string               |

---

## Core Components

### AgentCore

The `AgentCore` class is the heart of the application. It orchestrates:

1. **Input validation** using Zod schemas
2. **Tool registration** from the ToolRegistry
3. **Model calls** via OpenRouter or alternative providers
4. **Tool execution** with approval flow for sensitive tools
5. **Response streaming** with reasoning display
6. **Conversation persistence** to SQLite

#### Usage

```typescript
import { agentCore } from './agent/core.js';

const response = await agentCore.run(
  {
    userPrompt: { text: 'Hello, how are you?' },
    systemPrompt: 'You are a helpful assistant.',
    history: [],
  },
  {
    conversationId: 'conv-123',
    requestApproval: async (description) => {
      console.log(`Approve: ${description}`);
      return true;
    },
  },
  {
    onDelta: (delta) => {
      if (delta.type === 'content') process.stdout.write(delta.text);
      if (delta.type === 'reasoning') console.log('[reasoning]', delta.text);
    },
    maxTurns: 5,
  },
);
```

#### Run Options

| Option           | Type                                      | Default | Description                    |
| ---------------- | ----------------------------------------- | ------- | ------------------------------ |
| `history`        | `DbMessage[]`                             | `[]`    | Previous conversation messages |
| `extraTools`     | `Tool[]`                                  | `[]`    | Additional tools for this run  |
| `onDelta`        | `(delta: StreamDelta) => void`            | -       | Callback for streaming deltas  |
| `maxTurns`       | `number`                                  | `5`     | Maximum tool call turns        |
| `sdkContext`     | `Record<string, Record<string, unknown>>` | -       | SDK context for model calls    |
| `responseFormat` | `ResponseFormat`                          | -       | Response format specification  |
| `noTools`        | `boolean`                                 | `false` | Disable tools                  |
| `temperature`    | `number`                                  | -       | Model sampling temperature     |

#### Stream Delta Types

| Type              | Description                          |
| ----------------- | ------------------------------------ |
| `reasoning`       | AI reasoning text                    |
| `content`         | Response content                     |
| `tool_call_delta` | Tool call in progress                |
| `done`            | Stream complete                      |
| `router_decision` | Model decided which tools to call    |
| `tool_start`      | Tool execution started               |
| `tool_end`        | Tool execution completed             |
| `tool_skipped`    | Tool execution skipped (no approval) |

### LLM Client

The LLM layer supports multiple providers:

1. **OpenRouter** (default) - Multi-model gateway
2. **Xiaomi MiMo** - Direct Xiaomi integration
3. **OpenAI-Compatible** - Any OpenAI-compatible API

#### Model Routing

```
Input
  ↓
Has images? → Yes → Chat Completions API (vision)
  ↓ No
Xiaomi key? → Yes → Xiaomi MiMo API
  ↓ No
OpenAI-compat key? → Yes → OpenAI-compatible API
  ↓ No
OpenRouter Responses API (tools & multi-turn)
```

### Session Management

Sessions track conversation state and user profiles:

```typescript
import { getSession, createSession } from './agent/session.js';

const session = await getSession('cli', 'user-123');
if (!session) {
  const newSession = await createSession('cli', 'user-123', 'John');
}
```

---

## Adapters

### CLI Adapter

The CLI provides an interactive REPL interface:

#### Commands

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

#### REPL Flow

```typescript
import { startRepl } from './adapters/cli/repl.js';
import { cronManager } from './cron/manager.js';

await startRepl(cronManager);
```

### Telegram Adapter

The Telegram adapter allows running the agent as a Telegram bot:

```typescript
import { createTelegramBot, startTelegramBot } from './adapters/telegram/bot.js';

const bot = createTelegramBot(process.env.TELEGRAM_BOT_TOKEN);
await startTelegramBot(bot);
```

#### Permissions

The Telegram adapter includes a permission system for sensitive tools:

```typescript
import { checkPermission } from './adapters/telegram/permissions.js';

const allowed = await checkPermission(userId, toolName);
```

### HTTP API Adapter

The HTTP API provides RESTful endpoints for price list OCR:

```typescript
import { startApiServer } from './adapters/api/server.js';

await startApiServer(); // Starts on API_PORT
```

#### Endpoints

| Endpoint          | Method | Description                        |
| ----------------- | ------ | ---------------------------------- |
| `/health`         | GET    | Health check                       |
| `/ready`          | GET    | Readiness check                    |
| `/metrics`        | GET    | Application metrics                |
| `/api/price-list` | POST   | Upload and parse price list images |

#### Security Features

- **Rate Limiting**: 100 requests per minute per IP
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options, HSTS
- **CORS**: Configurable origins
- **File Validation**: Size limits, MIME type checking

---

## Tools System

### ToolRegistry

The `ToolRegistry` manages all available tools:

```typescript
import { toolRegistry } from './tools/registry.js';

// Register a tool
toolRegistry.register(myTool);

// Get a tool
const tool = toolRegistry.get('my_tool');

// List all tools
const toolNames = toolRegistry.list();
```

### Creating Custom Tools

1. Create a new file in `src/tools/implementations/`:

```typescript
// src/tools/implementations/my-tool.ts
import { z } from 'zod';
import type { ToolDefinition } from '../../types/index.js';

export const myTool: ToolDefinition<{ input: string }> = {
  name: 'my_tool',
  description: 'What this tool does',
  inputSchema: z.object({ input: z.string() }),
  tags: ['my-category'],
  requiresApproval: false,
  execute: async ({ input }) => {
    // Tool logic here
    return { success: true, output: `Processed: ${input}` };
  },
};
```

2. Register in `src/tools/implementations/index.ts`:

```typescript
import { myTool } from './my-tool.js';

export function registerBuiltinTools(): void {
  // ... existing tools
  toolRegistry.register(myTool);
}
```

### Built-in Tools

#### Calculator

```typescript
// Evaluates mathematical expressions
{
  name: 'calculator',
  description: 'Evaluate mathematical expressions',
  inputSchema: z.object({ expression: z.string() }),
}
```

#### Cron Manager

```typescript
// Create, list, delete cron jobs
{
  name: 'cron_create',
  description: 'Create a new cron job',
  inputSchema: z.object({
    name: z.string(),
    schedule: z.string(),
    prompt: z.string(),
  }),
}
```

#### Telegram Send

```typescript
// Send messages via Telegram
{
  name: 'telegram_send',
  description: 'Send a message via Telegram',
  inputSchema: z.object({
    chatId: z.number(),
    message: z.string(),
  }),
}
```

---

## Database Layer

### Schema

The database uses SQLite with better-sqlite3:

```sql
-- Conversations table
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('cli','telegram','cron')),
  telegram_chat_id INTEGER,
  cron_job_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
  content TEXT NOT NULL,
  tool_call_id TEXT,
  tool_name TEXT,
  tool_calls_json TEXT,
  reasoning_content TEXT,
  created_at INTEGER NOT NULL
);

-- User profiles table
CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('cli','telegram')),
  source_id TEXT NOT NULL,
  expectations TEXT,
  onboarded_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(source, source_id)
);

-- Indexes
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_conv_source ON conversations(source, created_at);
```

### Operations

```typescript
import {
  createConversation,
  getConversation,
  appendMessage,
  getMessages,
  getConversationCount,
  getMessageCount,
} from './db/conversations.js';

// Create a conversation
const conv = createConversation({
  source: 'cli',
  title: 'My conversation',
});

// Add a message
appendMessage({
  conversationId: conv.id,
  role: 'user',
  content: 'Hello!',
});

// Get messages
const messages = getMessages(conv.id);
```

---

## Cron Scheduling

### CronManager

The `CronManager` handles scheduled tasks:

```typescript
import { cronManager } from './cron/manager.js';

// Initialize (loads from crons.json)
cronManager.initialize();

// Create a cron job
const job = await cronManager.create({
  name: 'Daily summary',
  schedule: '0 9 * * *', // Every day at 9am
  prompt: 'Summarize my tasks for today',
  enabled: true,
  telegramChatId: 123456789,
});

// List jobs
const jobs = cronManager.list();

// Trigger manually
await cronManager.trigger(job.id);

// Delete a job
await cronManager.delete(job.id);
```

### Cron Expressions

Standard 5-field cron format:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6) (Sunday=0)
│ │ │ │ │
* * * * *
```

Examples:

- `*/5 * * * *` — Every 5 minutes
- `0 * * * *` — Every hour
- `0 9 * * 1-5` — Weekdays at 9am
- `0 0 1 * *` — First day of month

### Storage

Cron jobs are persisted in `./data/crons.json`:

```json
[
  {
    "id": "uuid-here",
    "name": "Daily summary",
    "schedule": "0 9 * * *",
    "prompt": "Summarize my tasks",
    "enabled": true,
    "telegramChatId": 123456789,
    "lastRunAt": 1234567890,
    "lastRunStatus": "success",
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
]
```

---

## Error Handling

### Error Hierarchy

```
AppError (base)
├── ValidationError (400)
├── AuthError (401)
├── RateLimitError (429)
├── ModelError (502)
├── NetworkError (503)
├── DatabaseError (500)
├── ToolError (500)
└── ConfigError (500)
```

### Usage

```typescript
import { ErrorHandler, ValidationError, ModelError } from './errors/index.js';

// Catch and handle errors
try {
  await someOperation();
} catch (error) {
  const appError = ErrorHandler.handle(error, {
    operation: 'test',
    userId: '123',
  });

  console.error(appError.toJSON());

  // Check error type
  if (appError instanceof ValidationError) {
    console.log('Validation failed:', appError.fields);
  } else if (appError instanceof ModelError) {
    console.log('Model error:', appError.model);
  }
}
```

### Error Response Format

```json
{
  "name": "ValidationError",
  "message": "Invalid input",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "isOperational": true,
  "timestamp": "2026-05-30T12:00:00.000Z",
  "stack": "...",
  "fields": {
    "email": "Invalid email format"
  }
}
```

---

## Validation

### Schemas

All input is validated using Zod schemas:

```typescript
import {
  validate,
  validateOrThrow,
  UserPromptSchema,
  AgentInputSchema,
  ImageUploadSchema,
} from './validation/index.js';

// Validate and get result
const result = validate(UserPromptSchema, userInput);
if (!result.success) {
  console.error(result.errors);
}

// Validate or throw
const data = validateOrThrow(UserPromptSchema, userInput);
```

### Available Schemas

| Schema                | Description                |
| --------------------- | -------------------------- |
| `UserPromptSchema`    | User prompt validation     |
| `MessageSchema`       | Message validation         |
| `AgentInputSchema`    | Agent input validation     |
| `ConversationSchema`  | Conversation validation    |
| `UserProfileSchema`   | User profile validation    |
| `CronJobSchema`       | Cron job validation        |
| `ImageUploadSchema`   | Image upload validation    |
| `PriceListItemSchema` | Price list item validation |

### Sanitization

```typescript
import { sanitizeString, sanitizeObject } from './validation/index.js';

// Sanitize a string
const clean = sanitizeString('<script>alert("xss")</script>');

// Sanitize an object
const cleanObj = sanitizeObject({ name: '<b>John</b>' });
```

---

## Logging

### Structured Logger

```typescript
import { logger } from './utils/logger.js';

// Info
logger.info('User created', { userId: '123', email: 'user@example.com' });

// Error
logger.error('Operation failed', { operation: 'createUser' }, error);

// Debug
logger.debug('Processing request', { requestId: 'req-123' });

// Warn
logger.warn('Deprecated API used', { endpoint: '/old-api' });
```

### Log Levels

| Level   | Use Case                   |
| ------- | -------------------------- |
| `error` | Errors that need attention |
| `warn`  | Warning conditions         |
| `info`  | Informational messages     |
| `debug` | Debug information          |

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

```
src/__tests__/
├── errors/
│   └── base.test.ts
├── tools/
│   └── registry.test.ts
├── utils/
│   ├── format.test.ts
│   └── logger.test.ts
├── validation/
│   └── schemas.test.ts
└── setup.ts
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';
import { validate, UserPromptSchema } from '../validation/index.js';

describe('UserPromptSchema', () => {
  it('should validate valid prompt', () => {
    const result = validate(UserPromptSchema, { text: 'Hello' });
    expect(result.success).toBe(true);
  });

  it('should reject empty prompt', () => {
    const result = validate(UserPromptSchema, { text: '' });
    expect(result.success).toBe(false);
  });
});
```

### Coverage

Tests cover:

- ✅ Validation schemas
- ✅ Error handling
- ✅ Tool registry
- ✅ Utility functions
- ✅ Logger functionality

---

## API Reference

### Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "development"
}
```

### Readiness Check

```http
GET /ready
```

**Response:**

```json
{
  "status": "ready",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "services": {
    "database": "connected",
    "api": "running"
  }
}
```

### Metrics

```http
GET /metrics
```

**Response:**

```json
{
  "timestamp": "2026-05-30T12:00:00.000Z",
  "metrics": {
    "conversations": 150,
    "messages": 1250,
    "uptime": 3600,
    "memory": {
      "rss": 50000000,
      "heapTotal": 30000000,
      "heapUsed": 20000000,
      "external": 5000000
    }
  }
}
```

### Price List Upload

```http
POST /api/price-list
Content-Type: multipart/form-data
```

**Request:**

- `file`: Image file (JPEG, PNG, GIF, WebP)
- Max size: 10MB per file
- Max files: 50

**Response (SSE):**

```
event: start
data: {"message":"Uploading file"}

event: received
data: {"filename":"price-list.jpg","mimetype":"image/jpeg"}

event: enhancing
data: {"message":"Enhancing image"}

event: uploaded
data: {"fileId":"...","url":"...","folderUrl":"..."}

event: result
data: {"items":[...],"driveUrl":"...","driveFolderUrl":"..."}

event: done
data: {"ok":true}
```

---

## Development Guide

### Code Quality

```bash
# Lint code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format
```

### Pre-commit Hooks

Husky + lint-staged automatically:

- Runs ESLint with auto-fix on `.ts` files
- Runs Prettier on `.ts`, `.json`, `.md` files

### Building for Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Adding New Features

1. **Create feature branch**

   ```bash
   git checkout -b feature/my-feature
   ```

2. **Implement changes**
   - Follow existing code patterns
   - Add tests for new functionality
   - Update documentation

3. **Run tests**

   ```bash
   npm test
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

---

## Troubleshooting

### Common Issues

#### Missing Environment Variables

```
Error: Missing required environment variable: OPENROUTER_API_KEY
```

**Solution:** Create `.env` file with required variables.

#### Database Locked

```
Error: SQLITE_BUSY: database is locked
```

**Solution:** Ensure only one instance is running. Check for zombie processes.

#### Telegram Bot Not Starting

```
Error: Telegram bot token is invalid
```

**Solution:** Verify `TELEGRAM_BOT_TOKEN` in `.env`. Get token from @BotFather.

#### Model Call Fails

```
ModelError: Model call failed
```

**Solution:**

1. Check `OPENROUTER_API_KEY` is valid
2. Verify `MODEL` is available on OpenRouter
3. Check network connectivity

### Debug Mode

Enable debug logging:

```bash
DEBUG=* npm run dev
```

### Getting Help

1. Check the [Issues](https://github.com/your-repo/issues) page
2. Review error logs in `./data/`
3. Enable debug mode for detailed output

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run `npm test` and `npm run lint`
6. Submit a pull request

---

## License

MIT License - see [LICENSE](../LICENSE) for details.
