import { z } from 'zod';

export const ProjectStatusSchema = z.enum(['creating', 'ready', 'modifying', 'running', 'failed']);
export const ProjectSchema = z.object({
  id: z.string().uuid(), name: z.string(), description: z.string(), workspacePath: z.string(),
  status: ProjectStatusSchema, selectedAgent: z.enum(['codex', 'claude']), appUrl: z.string().url().optional(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const VersionSchema = z.object({
  id: z.string(), projectId: z.string().uuid(), commitHash: z.string(), request: z.string(), createdAt: z.string(),
});
export type Version = z.infer<typeof VersionSchema>;
