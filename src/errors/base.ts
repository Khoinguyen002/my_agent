/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string = 'APP_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON format for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Convert error to string representation
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400);
    this.fields = fields;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      fields: this.fields,
    };
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  public readonly query?: string;

  constructor(message: string, query?: string) {
    super(message, 'DATABASE_ERROR', 500);
    this.query = query;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      query: this.query,
    };
  }
}

/**
 * Model/API call error
 */
export class ModelError extends AppError {
  public readonly model?: string;
  public readonly provider?: string;

  constructor(message: string, model?: string, provider?: string) {
    super(message, 'MODEL_ERROR', 502);
    this.model = model;
    this.provider = provider;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      model: this.model,
      provider: this.provider,
    };
  }
}

/**
 * Tool execution error
 */
export class ToolError extends AppError {
  public readonly toolName: string;

  constructor(message: string, toolName: string) {
    super(message, 'TOOL_ERROR', 500);
    this.toolName = toolName;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      toolName: this.toolName,
    };
  }
}

/**
 * Authentication/Authorization error
 */
export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'AUTH_ERROR', 401);
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.retryAfter = retryAfter;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Configuration error
 */
export class ConfigError extends AppError {
  public readonly configKey?: string;

  constructor(message: string, configKey?: string) {
    super(message, 'CONFIG_ERROR', 500, false); // Non-operational
    this.configKey = configKey;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      configKey: this.configKey,
    };
  }
}

/**
 * Network/Connection error
 */
export class NetworkError extends AppError {
  public readonly url?: string;

  constructor(message: string, url?: string) {
    super(message, 'NETWORK_ERROR', 503);
    this.url = url;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      url: this.url,
    };
  }
}
