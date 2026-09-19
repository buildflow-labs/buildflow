import { createServer } from 'node:net';
import type { ProjectManager } from '../projects/project-manager.js';
import { ProcessManager, type ManagedProcess } from '../processes/process-manager.js';
import { npmCommand } from '../processes/npm-command.js';

export type RuntimeInfo = { projectId: string; url: string; port: number };
export type HealthStatus = { healthy: boolean; status?: number };
export class RuntimeManager {
  private running = new Map<string, { process: ManagedProcess; info: RuntimeInfo }>();
  constructor(private processes: ProcessManager, private projects: ProjectManager) {}
  private port() { return new Promise<number>((resolve, reject) => { const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const a = s.address(); if (!a || typeof a === 'string') return reject(new Error('No port')); const port = a.port; s.close(() => resolve(port)); }); }); }
  async start(projectId: string) { const p = await this.projects.getProject(projectId), port = await this.port(), info = { projectId, port, url: `http://127.0.0.1:${port}` }; const proc = this.processes.spawn({ ...npmCommand(['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)]), cwd: p.workspacePath, projectId }); this.running.set(projectId, { process: proc, info }); proc.completion.finally(() => { if (this.running.get(projectId)?.process === proc) this.running.delete(projectId); }).catch(() => {}); await this.waitHealthy(projectId); return info; }
  async stop(projectId: string) { const item = this.running.get(projectId); if (item) await item.process.terminate(); this.running.delete(projectId); }
  async restart(projectId: string) { await this.stop(projectId); return this.start(projectId); }
  async healthCheck(projectId: string): Promise<HealthStatus> { const item = this.running.get(projectId); if (!item) return { healthy: false }; try { const response = await fetch(`${item.info.url}/api/health`, { signal: AbortSignal.timeout(2_000) }); return { healthy: response.ok, status: response.status }; } catch { return { healthy: false }; } }
  private async waitHealthy(projectId: string) { for (let i = 0; i < 30; i++) { const h = await this.healthCheck(projectId); if (h.healthy) return; await new Promise((r) => setTimeout(r, 500)); } await this.stop(projectId); throw new Error('Application did not become healthy'); }
  getInfo(projectId: string) { return this.running.get(projectId)?.info; }
}
