import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, type Tool } from '../../tools/registry.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  const createMockTool = (name: string): Tool =>
    ({
      type: 'function',
      function: {
        name,
        description: `Test tool: ${name}`,
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    }) as unknown as Tool;

  describe('register', () => {
    it('should register a tool', () => {
      const tool = createMockTool('test_tool');
      registry.register(tool);

      expect(registry.get('test_tool')).toBe(tool);
    });

    it('should overwrite existing tool with same name', () => {
      const tool1 = createMockTool('test_tool');
      const tool2 = createMockTool('test_tool');

      registry.register(tool1);
      registry.register(tool2);

      expect(registry.get('test_tool')).toBe(tool2);
    });
  });

  describe('get', () => {
    it('should return registered tool', () => {
      const tool = createMockTool('test_tool');
      registry.register(tool);

      expect(registry.get('test_tool')).toBe(tool);
    });

    it('should return undefined for unregistered tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered tools', () => {
      const tool1 = createMockTool('tool1');
      const tool2 = createMockTool('tool2');

      registry.register(tool1);
      registry.register(tool2);

      const allTools = registry.getAll();
      expect(allTools).toHaveLength(2);
      expect(allTools).toContain(tool1);
      expect(allTools).toContain(tool2);
    });
  });

  describe('list', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all tool names', () => {
      registry.register(createMockTool('tool1'));
      registry.register(createMockTool('tool2'));

      expect(registry.list()).toEqual(['tool1', 'tool2']);
    });
  });
});
