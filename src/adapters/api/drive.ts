import { google } from 'googleapis';
import { Readable } from 'stream';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export type DriveUploadResult = {
  fileId: string;
  url: string;
};

function loadOAuthClient() {
  const { googleOAuthClientId, googleOAuthClientSecret, googleOAuthRefreshToken } = env;
  if (!googleOAuthClientId || !googleOAuthClientSecret || !googleOAuthRefreshToken) {
    throw new Error('Missing Google OAuth env vars');
  }
  const client = new google.auth.OAuth2(googleOAuthClientId, googleOAuthClientSecret);
  client.setCredentials({ refresh_token: googleOAuthRefreshToken });
  return client;
}

function makePublicUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export async function uploadToDrive(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<DriveUploadResult> {
  const auth = loadOAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  logger.info('Drive upload: start', {
    filename,
    mimeType,
    size: buffer.length,
    folderId: env.driveFolderId || undefined,
  });

  const requestBody: { name: string; parents?: string[] } = { name: filename };
  if (env.driveFolderId) {
    requestBody.parents = [env.driveFolderId];
  }

  const createRes = await drive.files.create({
    requestBody,
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id',
  });

  const fileId = createRes.data.id;
  if (!fileId) {
    throw new Error('Drive upload failed: missing file ID');
  }

  if (env.drivePublic) {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  }

  logger.info('Drive upload: done', { fileId });

  return {
    fileId,
    url: makePublicUrl(fileId),
  };
}
