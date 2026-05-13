import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { env } from "../../config/env.js";
import { parsePriceListImage } from "./price-list.js";
import { logger } from "../../utils/logger.js";
import { uploadToDrive } from "./drive.js";

function buildFilename(originalName?: string): string {
  const base = `price-list-${Date.now()}`;
  if (!originalName) return base;
  const dot = originalName.lastIndexOf(".");
  if (dot === -1 || dot === 0 || dot === originalName.length - 1) return base;
  return `${base}${originalName.slice(dot)}`;
}

export async function startApiServer(): Promise<void> {
  const fastify = Fastify({ logger: false });

  await fastify.register(multipart, {
    limits: {
      fileSize: 8 * 1024 * 1024,
    },
  });

  fastify.post("/api/price-list", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "Missing file" });
    }

    logger.info("API price-list: received file", {
      filename: file.filename,
      mimetype: file.mimetype,
    });

    const hasOAuth = Boolean(env.googleOAuthRefreshToken);
    const hasServiceAccount = Boolean(env.googleServiceAccountJson);
    if (!hasOAuth && !hasServiceAccount) {
      return reply.code(500).send({ error: "Missing Drive credentials" });
    }

    const buffer = await file.toBuffer();
    const mime = file.mimetype || "application/octet-stream";
    const filename = buildFilename(file.filename);

    logger.info("API price-list: uploading to Drive", { filename });
    const upload = await uploadToDrive(buffer, mime, filename);
    logger.info("API price-list: upload complete", {
      fileId: upload.fileId,
      url: upload.url,
    });

    logger.info("API price-list: calling model");
    const result = await parsePriceListImage(upload.url, env.productHints);
    logger.info("API price-list: model response", {
      items: result.items.length,
    });
    return reply.code(200).send({ ...result, driveUrl: upload.url });
  });

  const port = env.apiPort;
  if (port <= 0) return;

  await fastify.listen({ port, host: "0.0.0.0" });
  logger.info(`API server listening on :${port}`);
}
