import { serializeObject } from '../utils/index.js';
import { Output, Rule, Task } from './type.js';

const buildTasks = (tasks: Task[], label = 'TASK'): string => {
  return tasks
    .map((t, i) => {
      const examplesText = t.fewShotExamples
        ? t.fewShotExamples
            .map((e, j) => `${j + 1}. Input: ${e.input} → Output: ${e.output}`)
            .join('\n    ')
        : '';
      const subTasksText = t.subTasks?.length
        ? t.subTasks.map((s, k) => `  Step ${k + 1}: ${s}`).join('\n')
        : '';
      const notesText = t.notes?.length ? t.notes.map((n, k) => `  ${k + 1}. ${n}`).join('\n') : '';
      return `
${label} ${i + 1} — ${t.title}:
${t.description}
${subTasksText}
${notesText}
${examplesText ? `- Example (Few-shot):\n    ${examplesText}` : ''}`.trim();
    })
    .join('\n\n');
};

export class PromptTemplate {
  role: string;
  rules: Rule[] = [];
  tasks: Task[] = [];
  notes: Task[] = [];
  globalInstruction?: string;
  input?: string;
  output?: Output;

  constructor(params: {
    role: string;
    rules?: Rule[];
    tasks?: Task[];
    notes?: Task[];
    globalInstruction?: string;
    input?: string;
    output?: Output;
  }) {
    this.role = params.role;
    this.rules = params.rules ?? [];
    this.tasks = params.tasks ?? [];
    this.notes = params.notes ?? [];
    this.input = params.input;
    this.globalInstruction = params.globalInstruction;
    this.output = params.output;
  }

  build(): string {
    let output = `[ROLE]\n${this.role}.\n`;

    // Only render RULES if there are any
    if (this.rules.length > 0) {
      const rulesText = this.rules.map((r, i) => `${i + 1}. ${r}`).join('\n  ');
      output += `\n[RULES]\n${rulesText}\n`;
    }

    // Only render TASKS if there are any
    if (this.tasks.length > 0) {
      output += `\n[TASKS]\n${buildTasks(this.tasks)}\n`;
    }

    // Only render NOTES if there are any
    if (this.notes.length > 0) {
      output += `\n[NOTES]\n${buildTasks(this.notes, 'NOTE')}\n`;
    }

    // Only render GLOBAL INSTRUCTION if exists
    if (this.globalInstruction) {
      output += `\n[GLOBAL INSTRUCTION]\n${this.globalInstruction}\n`;
    }

    // Only render INPUT if exists
    if (this.input) {
      output += `\n[INPUT]\n${this.input}\n`;
    }

    // Only render OUTPUT SCHEMA if exists
    if (this.output) {
      if (this.output.type === 'json' && this.output.jsonSchema) {
        output += `\n[OUTPUT SCHEMA]\nReturn a JSON object that strictly adheres to the following JSON Schema:\n${serializeObject(this.output.jsonSchema)}\n`;
      }
      if (this.output.type === 'text' && this.output.format) {
        output += `\n[OUTPUT]\nReturn a ${this.output.type} in the following format:\n${this.output.format}\n`;
      }
    }

    return output.trim();
  }
}
