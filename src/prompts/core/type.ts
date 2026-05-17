type FewShotExample = { input: string; output: string };
export type Rule = { title: string; description: string };
export type Task = {
  title: string;
  description: string;
  subTasks?: string[];
  notes?: string[];
  fewShotExamples?: FewShotExample[];
};
export type Output = { type: 'text'; format: string } | { type: 'json'; jsonSchema: object };
