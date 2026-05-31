# Quick Start Guide

Get My Agent up and running in 5 minutes!

## Prerequisites

- Node.js 18+ installed ([Download](https://nodejs.org/))
- An OpenRouter API key ([Get one](https://openrouter.ai))

## Step 1: Install

```bash
# Clone the repository
git clone <repository-url>
cd my_agent

# Install dependencies
npm install
```

## Step 2: Configure

```bash
# Copy environment template
cp .env.example .env
```

Edit `.env` and add your API key:

```env
OPENROUTER_API_KEY=your_api_key_here
MODEL=qwen/qwen3-8b
```

## Step 3: Run

### CLI Mode (Recommended for first try)

```bash
npm run dev
```

You'll see:

```
🤖 My Agent v1.0.0
Type /help for commands, or just chat!

>
```

Try typing:

- "Hello, how are you?"
- "What can you do?"
- "Calculate 2 + 2"

### Telegram Bot Mode

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Add token to `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

3. Run:

```bash
npm run dev:telegram
```

### API Server Mode

1. Set port in `.env`:

```env
API_PORT=3000
```

2. Run:

```bash
npm run dev
```

3. Test:

```bash
curl http://localhost:3000/health
```

## Step 4: Try It Out

### CLI Commands

```
> /help          Show all commands
> /new           Start a new conversation
> /list          List recent conversations
> /tools         List available tools
> /exit          Quit
```

### Natural Language

Just type naturally:

```
> What's the weather like today?
> Help me write a Python script
> Create a cron job that reminds me to stretch every hour
```

### Using Tools

The AI can use tools automatically:

```
> Calculate 15% of 250
> What time is it in Tokyo?
```

## Step 5: Explore

### Add a Custom Tool

1. Create `src/tools/implementations/hello.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types/index.js';

export const helloTool: ToolDefinition<{ name: string }> = {
  name: 'hello',
  description: 'Say hello to someone',
  inputSchema: z.object({
    name: z.string().describe('Name to greet'),
  }),
  tags: ['greeting'],
  requiresApproval: false,

  execute: async ({ name }) => {
    return {
      success: true,
      output: `Hello, ${name}! 👋`,
    };
  },
};
```

2. Register in `src/tools/implementations/index.ts`:

```typescript
import { helloTool } from './hello.js';

export function registerBuiltinTools(): void {
  // ... existing tools
  toolRegistry.register(helloTool);
}
```

3. Restart and try:

```
> Say hello to Alice
```

### Schedule a Cron Job

```
> Create a cron job called "morning greeting" that runs at 9am and says good morning
```

Or via CLI:

```
> /cron add
Name: morning greeting
Schedule: 0 9 * * *
Prompt: Say good morning and wish me a great day!
```

## Common Issues

### "Missing required environment variable"

Make sure your `.env` file exists and contains the required variables.

### "Model not found"

Check that the `MODEL` value is valid. See [OpenRouter models](https://openrouter.ai/models).

### "Telegram bot token is invalid"

Verify your token with [@BotFather](https://t.me/BotFather).

## Next Steps

- 📖 Read the [Full Documentation](PROJECT_DOCUMENTATION.md)
- 🔧 Learn about [Tool Development](TOOL_DEVELOPMENT.md)
- 🚀 See [Deployment Guide](DEPLOYMENT.md)
- 📡 Check [API Reference](API_REFERENCE.md)

## Getting Help

1. Check the [Troubleshooting](PROJECT_DOCUMENTATION.md#troubleshooting) section
2. Search [Issues](https://github.com/your-repo/issues)
3. Enable debug mode: `DEBUG=* npm run dev`

---

Happy coding! 🎉
