import type { Tool } from '@openrouter/sdk/lib/tool-types.js';

export type { Tool };

class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.function.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const toolRegistry = new ToolRegistry();
