import { PromptTemplate } from '../core/index.js';

export const buildBaseSystemPrompt = () => {
  const role = 'You are AI assistant that helps call tools based on user instructions.';

  const globalInstruction = `English is the primary language for all conversations.`;

  return new PromptTemplate({ role, globalInstruction }).build();
};
