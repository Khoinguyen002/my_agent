import { UserProfile, UserRow } from "../types/user/index.js";

export function rowToProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    source: row.source as UserProfile['source'],
    sourceId: row.source_id,
    expectations: row.expectations ?? undefined,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
  };
}