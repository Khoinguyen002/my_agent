import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export type DriveUploadResult = {
  fileId: string;
  url: string;
  folderId: string | null;
  folderUrl: string | null;
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

/** Create a Drive folder by name under an optional parent. Always creates a new folder. */
export async function createDriveFolder(name: string): Promise<{ folderId: string; folderUrl: string }> {
  const auth = loadOAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const meta: drive_v3.Schema$File = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (env.driveFolderId) meta.parents = [env.driveFolderId];

  const created = await drive.files.create({ requestBody: meta, fields: 'id' });
  if (!created.data.id) throw new Error('Drive: failed to create folder');

  const folderId = created.data.id;
  logger.info('Drive: folder created', { name, folderId });
  return { folderId, folderUrl: `https://drive.google.com/drive/folders/${folderId}` };
}

/** Upload a file into an existing folder by ID. */
export async function uploadToDrive(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  folderId: string | null,
): Promise<DriveUploadResult> {
  const auth = loadOAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  logger.info('Drive upload: start', { filename, mimeType, size: buffer.length, folderId });

  const parentId = folderId ?? env.driveFolderId ?? undefined;
  const requestBody: { name: string; parents?: string[] } = { name: filename };
  if (parentId) requestBody.parents = [parentId];

  const createRes = await drive.files.create({
    requestBody,
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  });

  const fileId = createRes.data.id;
  if (!fileId) throw new Error('Drive upload failed: missing file ID');

  if (env.drivePublic) {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  }

  logger.info('Drive upload: done', { fileId });

  return {
    fileId,
    url: makePublicUrl(fileId),
    folderId,
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
  };
}
