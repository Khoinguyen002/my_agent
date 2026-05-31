import {
  AppError,
  ValidationError,
  DatabaseError,
  ModelError,
  AuthError,
  RateLimitError,
  ConfigError,
  NetworkError,
} from './base.js';
import { logger } from '../utils/logger.js';

/**
 * Error handler utility class
 */
export class ErrorHandler {
  /**
   * Handle and log errors appropriately
   */
  static handle(error: unknown, context?: Record<string, unknown>): AppError {
    const appError = ErrorHandler.normalize(error);

    // Log the error
    logger.error('Error occurred', {
      ...appError.toJSON(),
      ...context,
    });

    return appError;
  }

  /**
   * Normalize any error to AppError
   */
  static normalize(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      // Try to detect error type from message
      const message = error.message.toLowerCase();

      if (message.includes('validation') || message.includes('invalid')) {
        return new ValidationError(error.message);
      }

      if (message.includes('database') || message.includes('sql')) {
        return new DatabaseError(error.message);
      }

      if (message.includes('model') || message.includes('api')) {
        return new ModelError(error.message);
      }

      return new AppError(error.message, 'UNKNOWN_ERROR', 500);
    }

    // Handle non-Error objects
    if (typeof error === 'string') {
      return new AppError(error, 'UNKNOWN_ERROR', 500);
    }

    return new AppError('An unexpected error occurred', 'UNKNOWN_ERROR', 500);
  }

  /**
   * Check if error is operational (expected)
   */
  static isOperational(error: unknown): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }

  /**
   * Get error response for API
   */
  static toResponse(error: unknown): {
    success: false;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  } {
    const appError = ErrorHandler.normalize(error);

    return {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.toJSON(),
      },
    };
  }

  /**
   * Handle async errors with try-catch wrapper
   */
  static async tryCatch<T>(fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw ErrorHandler.handle(error, context);
    }
  }

  /**
   * Create error boundary for functions
   */
  static boundary<T extends (...args: unknown[]) => unknown>(
    fn: T,
    errorHandler?: (error: AppError) => void,
  ): T {
    return ((...args: Parameters<T>) => {
      try {
        const result = fn(...args);

        // Handle async functions
        if (result instanceof Promise) {
          return result.catch((error) => {
            const appError = ErrorHandler.handle(error);
            if (errorHandler) {
              errorHandler(appError);
            }
            throw appError;
          });
        }

        return result;
      } catch (error) {
        const appError = ErrorHandler.handle(error);
        if (errorHandler) {
          errorHandler(appError);
        }
        throw appError;
      }
    }) as T;
  }
}

/**
 * Utility function to create typed error
 */
export function createError(
  type: 'validation' | 'database' | 'model' | 'auth' | 'rateLimit' | 'config' | 'network',
  message: string,
  details?: Record<string, unknown>,
): AppError {
  switch (type) {
    case 'validation':
      return new ValidationError(message, details?.fields as Record<string, string>);
    case 'database':
      return new DatabaseError(message, details?.query as string);
    case 'model':
      return new ModelError(message, details?.model as string, details?.provider as string);
    case 'auth':
      return new AuthError(message);
    case 'rateLimit':
      return new RateLimitError(message, details?.retryAfter as number);
    case 'config':
      return new ConfigError(message, details?.configKey as string);
    case 'network':
      return new NetworkError(message, details?.url as string);
    default:
      return new AppError(message, 'UNKNOWN_ERROR', 500);
  }
}

/**
 * Type guard to check if error is AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if error is operational
 */
export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}
