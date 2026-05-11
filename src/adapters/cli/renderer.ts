import type { StreamDelta } from '../../types/index.js';

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const ITALIC = '\x1b[3m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const GRAY   = '\x1b[90m';
const W = 54; // box width

function box(title: string, color: string): string {
  const bar = '─'.repeat(W - title.length - 3);
  return `${color}┌─ ${title} ${bar}┐${RESET}`;
}
function boxClose(color: string): string {
  return `${color}└${'─'.repeat(W)}┘${RESET}`;
}

export class TerminalRenderer {
  private inReasoning = false;

  feed(delta: StreamDelta): void {
    switch (delta.type) {

      case 'router_decision': {
        const names = (delta.toolNames ?? []).join(', ');
        process.stdout.write(
          `\n${box('Router decision', YELLOW)}\n` +
          `${YELLOW}│${RESET} ${BOLD}Tools selected:${RESET} ${names}\n` +
          `${boxClose(YELLOW)}\n`
        );
        break;
      }

      case 'tool_start': {
        const args = JSON.stringify(delta.toolArgs ?? {}, null, 2)
          .split('\n').map((l) => `${CYAN}│${RESET} ${DIM}${l}${RESET}`).join('\n');
        process.stdout.write(
          `\n${box(`⚙ ${delta.toolName ?? ''}`, CYAN)}\n` +
          `${CYAN}│${RESET} ${BOLD}Arguments:${RESET}\n` +
          `${args}\n`
        );
        break;
      }

      case 'tool_end': {
        const icon  = delta.toolSuccess ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
        const label = delta.toolSuccess ? `${GREEN}Result:${RESET}` : `${RED}Error:${RESET}`;
        const output = (delta.toolOutput ?? '').slice(0, 300) +
          ((delta.toolOutput?.length ?? 0) > 300 ? '…' : '');
        const lines = output.split('\n').map((l) => `${CYAN}│${RESET} ${l}`).join('\n');
        process.stdout.write(
          `${CYAN}│${RESET} ${icon} ${label}\n` +
          `${lines}\n` +
          `${boxClose(CYAN)}\n`
        );
        break;
      }

      case 'tool_skipped':
        process.stdout.write(
          `${YELLOW}│${RESET} ${YELLOW}⊘ skipped (not approved)${RESET}\n` +
          `${boxClose(YELLOW)}\n`
        );
        break;

      case 'reasoning':
        if (!this.inReasoning) {
          this.inReasoning = true;
          process.stdout.write(`\n${box('Thinking', GRAY)}\n${GRAY}│${RESET} ${DIM}${ITALIC}`);
        }
        process.stdout.write(delta.text ?? '');
        break;

      case 'content':
        if (this.inReasoning) {
          this.inReasoning = false;
          process.stdout.write(`${RESET}\n${boxClose(GRAY)}\n\n`);
        }
        process.stdout.write(delta.text ?? '');
        break;

      case 'tool_call_delta':
      case 'done':
        break;
    }
  }

  finish(): void {
    if (this.inReasoning) {
      process.stdout.write(`${RESET}\n${boxClose(GRAY)}\n`);
      this.inReasoning = false;
    }
    process.stdout.write('\n');
  }
}
