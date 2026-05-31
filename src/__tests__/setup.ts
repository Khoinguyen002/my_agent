import { beforeEach, afterEach, vi } from 'vitest';

// Global test setup
beforeEach(() => {
  // Reset any global state before each test
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  // Cleanup after each test
});

// Mock console methods to reduce noise in tests
export function mockConsole(): void {
  const originalConsole = { ...console };

  beforeEach(() => {
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    console.info = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
  });
}
