import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { env } from '../../config/env.js';
import { parsePriceListImage } from './price-list.js';
import { logger } from '../../utils/logger.js';
import { createDriveFolder, uploadToDrive } from './drive.js';
import { enhanceImage } from './enhance.js';
import { jobQueue } from './queue.js';
import { ErrorHandler, ValidationError } from '../../errors/index.js';
import { ImageUploadSchema, validate } from '../../validation/index.js';

function newBatchId(): string {
  const now = new Date();
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `price-list-${stamp}`;
}

function wantsSse(request: FastifyRequest): boolean {
  const accept = String(request.headers.accept || '');
  const streamQuery = request.query as { stream?: string | boolean | number | null };
  return (
    accept.includes('text/event-stream') ||
    streamQuery.stream === '1' ||
    streamQuery.stream === 1 ||
    streamQuery.stream === true
  );
}

function sendSse(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function startSse(reply: FastifyReply): void {
  // Copy headers already set by Fastify hooks (e.g. @fastify/cors) onto the raw
  // response before hijacking — hijack() bypasses onSend so they'd be lost otherwise.
  for (const [key, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) {
      reply.raw.setHeader(key, value as string | string[]);
    }
  }
  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders?.();
}

type FileEntry = { raw: Buffer; originalName: string; mimetype: string };

async function processFile(
  entry: FileEntry,
  folderId: string,
  onDelta?: (delta: unknown) => void,
): Promise<ReturnType<typeof parsePriceListImage>> {
  const filename = entry.originalName;

  const { buffer, mimeType: mime } = await enhanceImage(entry.raw);

  logger.info('API price-list: uploading to Drive', { filename, folderId });
  const upload = await uploadToDrive(buffer, mime, filename, folderId);
  logger.info('API price-list: upload complete', { fileId: upload.fileId, url: upload.url });

  logger.info('API price-list: calling model');
  const result = await parsePriceListImage(upload.url, onDelta);
  logger.info('API price-list: model response', { items: result.items.length });

  return { ...result, driveUrl: upload.url, driveFolderUrl: upload.folderUrl, filename };
}

export async function startApiServer(): Promise<void> {
  const fastify = Fastify({ logger: false });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 100, // Maximum 100 requests
    timeWindow: '1 minute', // Per minute
    errorResponseBuilder: (_request, context) => ({
      code: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry after ${context.after}`,
    }),
  });

  if (env.corsOrigins.length > 0) {
    await fastify.register(cors, { origin: env.corsOrigins });
  }

  await fastify.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 50,
    },
  });

  // Health check endpoint
  fastify.get('/health', async (_request, reply) => {
    try {
      // Check database connectivity
      const { db } = await import('../../db/client.js');
      db.prepare('SELECT 1').get();

      return reply.code(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
        environment: process.env['NODE_ENV'] || 'development',
      });
    } catch (error) {
      const appError = ErrorHandler.handle(error, { operation: 'health-check' });
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: appError.message,
      });
    }
  });

  // Readiness check endpoint
  fastify.get('/ready', async (_request, reply) => {
    try {
      // Check if all required services are ready
      const { db } = await import('../../db/client.js');
      db.prepare('SELECT 1').get();

      return reply.code(200).send({
        status: 'ready',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          api: 'running',
        },
      });
    } catch (error) {
      const appError = ErrorHandler.handle(error, { operation: 'readiness-check' });
      return reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: appError.message,
      });
    }
  });

  // Metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    try {
      const { getConversationCount } = await import('../../db/conversations.js');
      const { getMessageCount } = await import('../../db/conversations.js');

      const conversationCount = getConversationCount();
      const messageCount = getMessageCount('all'); // This needs to be updated

      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        metrics: {
          conversations: conversationCount,
          messages: messageCount,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      });
    } catch (error) {
      const appError = ErrorHandler.handle(error, { operation: 'metrics' });
      return reply.code(500).send({
        error: appError.message,
      });
    }
  });

  fastify.post('/api/price-list', async (request, reply) => {
    try {
      // Collect all uploaded files first
      const entries: FileEntry[] = [];
      for await (const part of request.files()) {
        const raw = await part.toBuffer();

        // Validate file
        const validationResult = validate(ImageUploadSchema, {
          filename: part.filename,
          mimetype: part.mimetype,
          size: raw.length,
        });

        if (!validationResult.success) {
          throw new ValidationError('Invalid file upload', {
            file: part.filename,
            errors: validationResult.errors.map((e) => e.message).join(', '),
          });
        }

        entries.push({ raw, originalName: part.filename, mimetype: part.mimetype });
      }

      if (entries.length === 0) {
        return reply.code(400).send({ error: 'Missing file' });
      }

      logger.info('API price-list: received files', { count: entries.length });

      // SSE is only supported for single-file requests
      const useSse = wantsSse(request) && entries.length === 1;

      if (useSse) {
        const entry = entries[0];
        startSse(reply);
        sendSse(reply, 'start', { message: 'Uploading file' });
        sendSse(reply, 'received', { filename: entry.originalName, mimetype: entry.mimetype });
        sendSse(reply, 'enhancing', { message: 'Enhancing image' });

        const { folderId, folderUrl } = await createDriveFolder(newBatchId());
        try {
          const result = await jobQueue.add(() =>
            processFile(entry, folderId, (delta) => {
              sendSse(reply, 'delta', delta);
            }),
          );
          sendSse(reply, 'uploaded', { fileId: '', url: result.driveUrl, folderUrl });
          sendSse(reply, 'result', result);
          sendSse(reply, 'done', { ok: true });
        } catch (err) {
          sendSse(reply, 'error', { error: String(err) });
        }

        reply.raw.end();
        return;
      }

      // Batch: create folder once, all files share it
      const { folderId } = await createDriveFolder(newBatchId());
      const results = await Promise.all(
        entries.map((entry) => jobQueue.add(() => processFile(entry, folderId))),
      );

      return reply.code(200).send(results);
    } catch (error) {
      const appError = ErrorHandler.handle(error, {
        operation: 'price-list',
        endpoint: '/api/price-list',
      });

      if (!reply.sent) {
        const errorResponse = ErrorHandler.toResponse(appError);
        reply.code(appError.statusCode).send(errorResponse);
      }
    }
  });

  const port = env.apiPort;
  if (port <= 0) {
    return;
  }

  await fastify.listen({ port, host: '0.0.0.0' });
  logger.info(`API server listening on :${port}`);
}
