import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { parsePriceListImage } from './price-list.js';
import { logger } from '../../utils/logger.js';
import { uploadToDrive } from './drive.js';

function buildFilename(originalName?: string): string {
  const base = `price-list-${Date.now()}`;
  if (!originalName) return base;
  const dot = originalName.lastIndexOf('.');
  if (dot === -1 || dot === 0 || dot === originalName.length - 1) return base;
  return `${base}${originalName.slice(dot)}`;
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
  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders?.();
}

export async function startApiServer(): Promise<void> {
  const fastify = Fastify({ logger: false });

  await fastify.register(multipart, {
    limits: {
      fileSize: 8 * 1024 * 1024,
    },
  });

  fastify.post('/api/price-list', async (request, reply) => {
    const useSse = wantsSse(request);

    if (useSse) {
      startSse(reply);
      sendSse(reply, 'start', { message: 'Uploading file' });
    }

    const file = await request.file();
    if (!file) {
      if (useSse) {
        sendSse(reply, 'error', { error: 'Missing file' });
        reply.raw.end();
        return;
      }
      return reply.code(400).send({ error: 'Missing file' });
    }

    logger.info('API price-list: received file', {
      filename: file.filename,
      mimetype: file.mimetype,
    });

    if (useSse) {
      sendSse(reply, 'received', {
        filename: file.filename,
        mimetype: file.mimetype,
      });
    }

    const buffer = await file.toBuffer();
    const mime = file.mimetype || 'application/octet-stream';
    const filename = buildFilename(file.filename);

    logger.info('API price-list: uploading to Drive', { filename });
    if (useSse) {
      sendSse(reply, 'uploading', { filename });
    }
    const upload = await uploadToDrive(buffer, mime, filename);
    logger.info('API price-list: upload complete', {
      fileId: upload.fileId,
      url: upload.url,
    });

    if (useSse) {
      sendSse(reply, 'uploaded', {
        fileId: upload.fileId,
        url: upload.url,
      });
      sendSse(reply, 'model', { message: 'Calling model' });
    }

    logger.info('API price-list: calling model');
    const result = await parsePriceListImage(
      upload.url,
      env.productHints,
      useSse ? (delta) => sendSse(reply, 'delta', delta) : undefined,
    );
    logger.info('API price-list: model response', {
      items: result.items.length,
    });

    const payload = { ...result, driveUrl: upload.url };

    if (useSse) {
      sendSse(reply, 'result', payload);
      sendSse(reply, 'done', { ok: true });
      reply.raw.end();
      return;
    }

    return reply.code(200).send(payload);
  });

  const port = env.apiPort;
  if (port <= 0) return;

  await fastify.listen({ port, host: '0.0.0.0' });
  logger.info(`API server listening on :${port}`);
}
