import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../utils/logger.js';

// Mock fs module
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
}));

describe('logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('info', () => {
    it('should log info message in dev mode', () => {
      process.env.NODE_ENV = 'development';
      logger.info('test message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0];
      expect(call[0]).toContain('INFO');
      expect(call[0]).toContain('test message');
    });
  });

  describe('warn', () => {
    it('should always log warning messages', () => {
      logger.warn('warning message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0];
      expect(call[0]).toContain('WARN');
      expect(call[0]).toContain('warning message');
    });
  });

  describe('error', () => {
    it('should always log error messages', () => {
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0];
      expect(call[0]).toContain('ERROR');
      expect(call[0]).toContain('error message');
    });
  });

  describe('debug', () => {
    it('should not log debug messages when DEBUG env is not set', () => {
      delete process.env.DEBUG;
      logger.debug('debug message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when DEBUG env is set', () => {
      process.env.DEBUG = '1';
      logger.debug('debug message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0];
      expect(call[0]).toContain('DEBUG');
      expect(call[0]).toContain('debug message');

      delete process.env.DEBUG;
    });
  });
});
