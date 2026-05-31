/**
 * Error handling module
 * Provides centralized error handling with custom error classes
 */

export {
  AppError,
  ValidationError,
  DatabaseError,
  ModelError,
  ToolError,
  AuthError,
  RateLimitError,
  ConfigError,
  NetworkError,
} from './base.js';

export { ErrorHandler, createError, isAppError, isOperationalError } from './handler.js';
