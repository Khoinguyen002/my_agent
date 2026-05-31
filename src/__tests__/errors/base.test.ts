import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  DatabaseError,
  ModelError,
  ToolError,
  AuthError,
  RateLimitError,
  ConfigError,
  NetworkError,
} from '../../errors/base.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('APP_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.stack).toBeDefined();
    });

    it('should create error with custom values', () => {
      const error = new AppError('Custom error', 'CUSTOM_CODE', 400, false);

      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(false);
    });

    it('should convert to JSON', () => {
      const error = new AppError('Test error');
      const json = error.toJSON();

      expect(json.name).toBe('AppError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('APP_ERROR');
      expect(json.statusCode).toBe(500);
      expect(json.isOperational).toBe(true);
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();
    });

    it('should convert to string', () => {
      const error = new AppError('Test error', 'TEST_CODE');
      expect(error.toString()).toBe('[TEST_CODE] Test error');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.fields).toBeUndefined();
    });

    it('should create validation error with fields', () => {
      const fields = { email: 'Invalid email format' };
      const error = new ValidationError('Invalid input', fields);

      expect(error.fields).toEqual(fields);
    });

    it('should include fields in JSON', () => {
      const fields = { email: 'Invalid email format' };
      const error = new ValidationError('Invalid input', fields);
      const json = error.toJSON();

      expect(json.fields).toEqual(fields);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Query failed');

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.query).toBeUndefined();
    });

    it('should create database error with query', () => {
      const error = new DatabaseError('Query failed', 'SELECT * FROM users');

      expect(error.query).toBe('SELECT * FROM users');
    });
  });

  describe('ModelError', () => {
    it('should create model error', () => {
      const error = new ModelError('Model failed');

      expect(error.code).toBe('MODEL_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.model).toBeUndefined();
      expect(error.provider).toBeUndefined();
    });

    it('should create model error with details', () => {
      const error = new ModelError('Model failed', 'gpt-4', 'openai');

      expect(error.model).toBe('gpt-4');
      expect(error.provider).toBe('openai');
    });
  });

  describe('ToolError', () => {
    it('should create tool error', () => {
      const error = new ToolError('Tool failed', 'calculator');

      expect(error.code).toBe('TOOL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.toolName).toBe('calculator');
    });
  });

  describe('AuthError', () => {
    it('should create auth error with default message', () => {
      const error = new AuthError();

      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });

    it('should create auth error with custom message', () => {
      const error = new AuthError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError();

      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBeUndefined();
    });

    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.retryAfter).toBe(60);
    });
  });

  describe('ConfigError', () => {
    it('should create config error', () => {
      const error = new ConfigError('Missing config');

      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
      expect(error.configKey).toBeUndefined();
    });

    it('should create config error with key', () => {
      const error = new ConfigError('Missing config', 'API_KEY');

      expect(error.configKey).toBe('API_KEY');
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection failed');

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBe(503);
      expect(error.url).toBeUndefined();
    });

    it('should create network error with url', () => {
      const error = new NetworkError('Connection failed', 'https://api.example.com');

      expect(error.url).toBe('https://api.example.com');
    });
  });
});
