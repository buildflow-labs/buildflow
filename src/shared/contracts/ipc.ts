import { z } from 'zod';
import type { AgentEvent } from '../events/agent-event.js';
import type { Project, Version } from '../models/project.js';

export const CreateProjectInput = z.object({ description: z.string().trim().min(3).max(10_000) });
export const ProjectIdInput = z.object({ projectId: z.string().uuid() });
export const ModifyProjectInput = ProjectIdInput.extend({ request: z.string().trim().min(2).max(10_000) });
export const RollbackInput = ProjectIdInput.extend({ versionId: z.string().min(1) });

export const IPC = {
  listProjects: 'projects:list', createProject: 'projects:create', modifyProject: 'projects:modify', retryProject: 'projects:retry',
  deleteProject: 'projects:delete', listVersions: 'projects:versions', rollback: 'projects:rollback',
  openApp: 'runtime:open', checkAgent: 'agent:check', event: 'agent:event',
} as const;

export interface DesktopApi {
  listProjects(): Promise<Project[]>;
  createProject(input: z.infer<typeof CreateProjectInput>): Promise<Project>;
  modifyProject(input: z.infer<typeof ModifyProjectInput>): Promise<Project>;
  retryProject(input: z.infer<typeof ProjectIdInput>): Promise<Project>;
  deleteProject(input: z.infer<typeof ProjectIdInput>): Promise<void>;
  listVersions(input: z.infer<typeof ProjectIdInput>): Promise<Version[]>;
  rollback(input: z.infer<typeof RollbackInput>): Promise<Project>;
  openApp(input: z.infer<typeof ProjectIdInput>): Promise<void>;
  checkAgent(): Promise<{ installed: boolean; version?: string }>;
  onAgentEvent(listener: (payload: { projectId: string; event: AgentEvent }) => void): () => void;
}
