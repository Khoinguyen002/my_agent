import { v4 as uuidv4 } from 'uuid';
import { db } from './client.js';
import { rowToProfile } from './utils/user.js';
import { UserProfile, UserRow } from './types/user/index.js';



export function getUserBySourceId(source: UserProfile['source'], sourceId: string): UserProfile | undefined {
  const row = db.prepare('SELECT * FROM user_profiles WHERE source = ? AND source_id = ?').get(source, sourceId) as UserRow | undefined;
  return row ? rowToProfile(row) : undefined;
}

export function saveUserProfile(profile: Omit<UserProfile, 'id' | 'createdAt'>): UserProfile {
  const now = Date.now();
  const full: UserProfile = { ...profile, id: uuidv4(), createdAt: now };
  db.prepare(`
    INSERT INTO user_profiles(id, name, source, source_id, expectations, onboarded_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_id) DO UPDATE SET
      name = excluded.name,
      expectations = excluded.expectations,
      onboarded_at = excluded.onboarded_at
  `).run(full.id, full.name, full.source, full.sourceId, full.expectations ?? null, full.onboardedAt, now);
  return getUserBySourceId(full.source, full.sourceId)!;
}
