import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Project, ProjectStatus } from '../../shared/models/project.js';

export class ProjectManager {
  constructor(private root: string) {}
  async init() { await mkdir(this.root, { recursive: true }); }
  private dir(id: string) { const path = resolve(this.root, id); if (!path.startsWith(resolve(this.root) + sep)) throw new Error('Invalid project path'); return path; }
  async createProject(description: string): Promise<Project> {
    const id = randomUUID(), now = new Date().toISOString(), dir = this.dir(id), workspacePath = join(dir, 'workspace'); await mkdir(join(dir, 'logs'), { recursive: true }); await mkdir(workspacePath, { recursive: true });
    const name = description.replace(/\s+/g, ' ').slice(0, 28) || '새 프로그램';
    const project: Project = { id, name, description, workspacePath, status: 'creating', selectedAgent: 'codex', createdAt: now, updatedAt: now }; await this.save(project); return project;
  }
  async getProject(id: string) { return JSON.parse(await readFile(join(this.dir(id), 'metadata.json'), 'utf8')) as Project; }
  async listProjects() { await this.init(); const { readdir } = await import('node:fs/promises'); const entries = await readdir(this.root, { withFileTypes: true }); const projects = await Promise.all(entries.filter((e) => e.isDirectory()).map((e) => this.getProject(e.name).catch(() => undefined))); return projects.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'status' | 'appUrl'>>) { const p = await this.getProject(id); const next = { ...p, ...patch, updatedAt: new Date().toISOString() }; await this.save(next); return next; }
  async setStatus(id: string, status: ProjectStatus) { return this.updateProject(id, { status }); }
  async deleteProject(id: string) { await rm(this.dir(id), { recursive: true, force: true }); }
  private async save(p: Project) { await writeFile(join(this.dir(p.id), 'metadata.json'), JSON.stringify(p, null, 2)); }
}
