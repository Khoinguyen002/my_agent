import { getUserBySourceId, saveUserProfile } from '../db/users.js';
import type { UserProfile } from '../types/index.js';

export async function runCliOnboarding(): Promise<UserProfile> {
  const existing = getUserBySourceId('cli', 'cli');
  if (existing) return existing;

  const { input } = await import('@inquirer/prompts');

  console.log('\nWelcome! Let me get to know you before we start.\n');

  const name = await input({ message: 'What is your name?' });
  const expectations = await input({
    message: 'What do you expect from me? (e.g. coding help, research, scheduling tasks)',
  });

  const profile = saveUserProfile({
    name,
    source: 'cli',
    sourceId: 'cli',
    expectations,
    onboardedAt: Date.now(),
  });

  console.log(`\nNice to meet you, ${profile.name}! Let's get started.\n`);
  return profile;
}

export async function runTelegramOnboarding(
  chatId: number,
  sendMessage: (text: string) => Promise<void>,
  waitForReply: () => Promise<string>
): Promise<UserProfile> {
  const existing = getUserBySourceId('telegram', String(chatId));
  if (existing) return existing;

  await sendMessage("Hi! I'm your AI agent. Before we begin, I'd like to learn a bit about you.");
  await sendMessage('What is your name?');
  const name = await waitForReply();

  await sendMessage(`Nice to meet you, ${name}! What do you expect from me? (e.g. coding help, research, reminders)`);
  const expectations = await waitForReply();

  const profile = saveUserProfile({
    name,
    source: 'telegram',
    sourceId: String(chatId),
    expectations,
    onboardedAt: Date.now(),
  });

  await sendMessage(`Great! I've saved your profile. Let's get started, ${profile.name}!`);
  return profile;
}

export function getOrNullProfile(source: UserProfile['source'], sourceId: string): UserProfile | undefined {
  return getUserBySourceId(source, sourceId);
}
