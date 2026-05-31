export interface UserRow {
  id: string;
  name: string;
  source: string;
  source_id: string;
  expectations: string | null;
  onboarded_at: number;
  created_at: number;
}

export interface UserProfile {
  id: string;
  name: string;
  source: 'tele';
  sourceId: string;
  expectations?: string;
  onboardedAt: number;
  createdAt: number;
}
