import { BrowserWindow, ipcMain } from 'electron';
import { CreateProjectInput, IPC, ModifyProjectInput, ProjectIdInput, RollbackInput } from '../../shared/contracts/ipc.js';
import type { SafeApplicationService } from '../app/safe-application-service.js';
import type { CodexAgent } from '../agents/codex-agent.js';
import type { MetadataDatabase } from '../metadata/database.js';
import type { ProjectManager } from '../projects/project-manager.js';
import type { RuntimeManager } from '../runtime/runtime-manager.js';

export function registerIpc(deps: { app: Pick<SafeApplicationService, 'create' | 'modify' | 'retry' | 'rollback'>; projects: ProjectManager; runtime: RuntimeManager; agent: CodexAgent; db: MetadataDatabase }) {
  ipcMain.handle(IPC.listProjects, () => deps.projects.listProjects());
  ipcMain.handle(IPC.createProject, (_e, value) => deps.app.create(CreateProjectInput.parse(value).description));
  ipcMain.handle(IPC.modifyProject, (_e, value) => { const v = ModifyProjectInput.parse(value); return deps.app.modify(v.projectId, v.request); });
  ipcMain.handle(IPC.retryProject, (_e, value) => deps.app.retry(ProjectIdInput.parse(value).projectId));
  ipcMain.handle(IPC.deleteProject, async (_e, value) => { const v = ProjectIdInput.parse(value); await deps.runtime.stop(v.projectId); await deps.projects.deleteProject(v.projectId); });
  ipcMain.handle(IPC.listVersions, (_e, value) => deps.db.list(ProjectIdInput.parse(value).projectId));
  ipcMain.handle(IPC.rollback, (_e, value) => { const v = RollbackInput.parse(value); return deps.app.rollback(v.projectId, v.versionId); });
  ipcMain.handle(IPC.openApp, async (_e, value) => {
    const v = ProjectIdInput.parse(value), info = deps.runtime.getInfo(v.projectId);
    if (!info) throw new Error('Application is not running');
    const project = await deps.projects.getProject(v.projectId);
    const window = new BrowserWindow({ width: 1100, height: 780, title: project.name, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.setMenuBarVisibility(false);
    await window.loadURL(info.url);
  });
  ipcMain.handle(IPC.checkAgent, async () => ({ installed: await deps.agent.isInstalled(), version: await deps.agent.version() }));
}
