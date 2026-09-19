import type { AgentEvent } from '../../shared/events/agent-event.js';
export type AgentProjectContext = { projectId: string; workspacePath: string };
export type AgentSession = AgentProjectContext & { id: string };
export interface CodingAgent {
  readonly id: string;
  isInstalled(): Promise<boolean>;
  startSession(context: AgentProjectContext): Promise<AgentSession>;
  execute(session: AgentSession, prompt: string): AsyncIterable<AgentEvent>;
  cancel(sessionId: string): Promise<void>;
}
