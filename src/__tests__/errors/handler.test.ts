import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorHandler, isAppError, isOperationalError } from '../../errors/handler.js';
import { AppError, ValidationError, DatabaseError, ModelError } from '../../errors/base.js';

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalize', () => {
    it('should return AppError as-is', () => {
      const error = new AppError('Test error');
      const normalized = ErrorHandler.normalize(error);

      expect(normalized).toBe(error);
    });

    it('should convert ValidationError', () => {
      const error = new ValidationError('Invalid input');
      const normalized = ErrorHandler.normalize(error);

      expect(normalized).toBe(error);
      expect(normalized.code).toBe('VALIDATION_ERROR');
    });

    it('should convert regular Error to AppError', () => {
      const error = new Error('Regular error');
      const normalized = ErrorHandler.normalize(error);

      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.message).toBe('Regular error');
      expect(normalized.code).toBe('UNKNOWN_ERROR');
    });

    it('should detect validation errors from message', () => {
      const error = new Error('Validation failed: invalid email');
      const normalized = ErrorHandler.normalize(error);

      expect(normalized).toBeInstanceOf(ValidationError);
    });

    it('should detect database errors from message', () => {
      const error = new Error('Database query failed');
      const normalized = ErrorHandler.normalize(error);

      expect(normalized).toBeInstanceOf(DatabaseError);
    });

    it('should detect model errors from message', () => {
      const error = new Error('Model API call failed');
      const normalized = ErrorHandler.normalize(error);

      expect(normalized).toBeInstanceOf(ModelError);
    });

    it('should handle string errors', () => {
      const normalized = ErrorHandler.normalize('String error');

      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.message).toBe('String error');
    });

    it('should handle unknown error types', () => {
      const normalized = ErrorHandler.normalize({ unknown: 'object' });

      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.message).toBe('An unexpected error occurred');
    });
  });

  describe('handle', () => {
    it('should handle and log error', () => {
      const error = new Error('Test error');
      const context = { userId: '123' };

      const result = ErrorHandler.handle(error, context);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Test error');
    });

    it('should handle AppError', () => {
      const error = new ValidationError('Invalid input');
      const result = ErrorHandler.handle(error);

      expect(result).toBe(error);
    });
  });

  describe('isOperational', () => {
    it('should return true for operational errors', () => {
      const error = new AppError('Test error', 'TEST', 500, true);
      expect(ErrorHandler.isOperational(error)).toBe(true);
    });

    it('should return false for non-operational errors', () => {
      const error = new AppError('Test error', 'TEST', 500, false);
      expect(ErrorHandler.isOperational(error)).toBe(false);
    });

    it('should return false for non-AppError', () => {
      const error = new Error('Test error');
      expect(ErrorHandler.isOperational(error)).toBe(false);
    });
  });

  describe('toResponse', () => {
    it('should convert AppError to response', () => {
      const error = new ValidationError('Invalid email', { email: 'Invalid format' });
      const response = ErrorHandler.toResponse(error);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Invalid email');
      expect(response.error.details).toBeDefined();
    });

    it('should convert regular Error to response', () => {
      const error = new Error('Test error');
      const response = ErrorHandler.toResponse(error);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('UNKNOWN_ERROR');
      expect(response.error.message).toBe('Test error');
    });
  });

  describe('tryCatch', () => {
    it('should return result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await ErrorHandler.tryCatch(fn);

      expect(result).toBe('success');
    });

    it('should throw normalized error on failure', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(ErrorHandler.tryCatch(fn)).rejects.toThrow(AppError);
    });

    it('should include context in error handling', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));
      const context = { operation: 'test' };

      await expect(ErrorHandler.tryCatch(fn, context)).rejects.toThrow();
    });
  });

  describe('boundary', () => {
    it('should wrap sync function', () => {
      const fn = vi.fn().mockReturnValue('success');
      const wrapped = ErrorHandler.boundary(fn);

      expect(wrapped()).toBe('success');
    });

    it('should handle sync function errors', () => {
      const fn = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });
      const wrapped = ErrorHandler.boundary(fn);

      expect(() => wrapped()).toThrow(AppError);
    });

    it('should wrap async function', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = ErrorHandler.boundary(fn);

      expect(await wrapped()).toBe('success');
    });

    it('should handle async function errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Async error'));
      const wrapped = ErrorHandler.boundary(fn);

      await expect(wrapped()).rejects.toThrow(AppError);
    });

    it('should call custom error handler', () => {
      const fn = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const errorHandler = vi.fn();
      const wrapped = ErrorHandler.boundary(fn, errorHandler);

      expect(() => wrapped()).toThrow();
      expect(errorHandler).toHaveBeenCalled();
    });
  });
});

describe('Type Guards', () => {
  describe('isAppError', () => {
    it('should return true for AppError instances', () => {
      const error = new AppError('Test error');
      expect(isAppError(error)).toBe(true);
    });

    it('should return true for derived error classes', () => {
      const error = new ValidationError('Test error');
      expect(isAppError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Test error');
      expect(isAppError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isAppError('string')).toBe(false);
      expect(isAppError(null)).toBe(false);
      expect(isAppError(undefined)).toBe(false);
      expect(isAppError(123)).toBe(false);
    });
  });

  describe('isOperationalError', () => {
    it('should return true for operational AppError', () => {
      const error = new AppError('Test error', 'TEST', 500, true);
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for non-operational AppError', () => {
      const error = new AppError('Test error', 'TEST', 500, false);
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for non-AppError', () => {
      const error = new Error('Test error');
      expect(isOperationalError(error)).toBe(false);
    });
  });
});
