import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { parsePriceListImage } from './price-list.js';
import { logger } from '../../utils/logger.js';
import { createDriveFolder, uploadToDrive } from './drive.js';
import { enhanceImage } from './enhance.js';
import { jobQueue } from './queue.js';

function newBatchId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
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
    if (value !== undefined) reply.raw.setHeader(key, value as string | string[]);
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

async function processFile(entry: FileEntry, folderId: string, onDelta?: (delta: unknown) => void) {
  const filename = entry.originalName;

  const { buffer, mimeType: mime } = await enhanceImage(entry.raw);

  logger.info('API price-list: uploading to Drive', { filename, folderId });
  const upload = await uploadToDrive(buffer, mime, filename, folderId);
  logger.info('API price-list: upload complete', { fileId: upload.fileId, url: upload.url });

  logger.info('API price-list: calling model');
  const result = await parsePriceListImage(upload.url, env.productHints, onDelta);
  logger.info('API price-list: model response', { items: result.items.length });

  return { ...result, driveUrl: upload.url, driveFolderUrl: upload.folderUrl, filename };
}

export async function startApiServer(): Promise<void> {
  const fastify = Fastify({ logger: false });

  if (env.corsOrigins.length > 0) {
    await fastify.register(cors, { origin: env.corsOrigins });
  }

  await fastify.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 50,
    },
  });

  fastify.post('/api/price-list', async (request, reply) => {
    try {
      // Collect all uploaded files first
      const entries: FileEntry[] = [];
      for await (const part of request.files()) {
        const raw = await part.toBuffer();
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
      logger.error('price-list handler error', { error });
      if (!reply.sent) {
        reply.code(500).send({ error: String(error) });
      }
    }
  });

  const port = env.apiPort;
  if (port <= 0) return;

  await fastify.listen({ port, host: '0.0.0.0' });
  logger.info(`API server listening on :${port}`);
}
