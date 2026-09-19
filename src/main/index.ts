import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { appendFile } from 'node:fs/promises';
import { SafeApplicationService } from './app/safe-application-service.js';
import { CodexAgent } from './agents/codex-agent.js';
import { GitManager } from './git/git-manager.js';
import { HarnessManager } from './harness/harness-manager.js';
import { registerIpc } from './ipc/register-ipc.js';
import { MetadataDatabase } from './metadata/database.js';
import { ProcessManager } from './processes/process-manager.js';
import { ProjectManager } from './projects/project-manager.js';
import { RuntimeManager } from './runtime/runtime-manager.js';
import { ValidationManager } from './validation/validation-manager.js';
import { WorkspaceTransactionManager } from './workspaces/workspace-transaction.js';
import { IPC } from '../shared/contracts/ipc.js';

const processes = new ProcessManager(); let db: MetadataDatabase | undefined; let quitting = false;
async function boot() {
  const window = new BrowserWindow({ width: 1120, height: 780, backgroundColor: '#0b1120', icon: join(import.meta.dirname, '../../assets/buildflow.png'), webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent('<!doctype html><html lang="ko"><meta charset="utf-8"><title>Buildflow</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#26334d;font:16px system-ui,sans-serif"><div>Buildflow가 프로그램을 준비하고 있습니다…</div></body></html>')}`);
  const projectsRoot = join(app.getPath('userData'), 'projects');
  const projects = new ProjectManager(projectsRoot); await projects.init();
  db = new MetadataDatabase(join(app.getPath('userData'), 'metadata.sqlite'));
  const agent = new CodexAgent(processes), runtime = new RuntimeManager(processes, projects);
  const service = new SafeApplicationService(projects, new HarnessManager(), agent, new ValidationManager(processes), new GitManager(processes), runtime, db, new WorkspaceTransactionManager(), (projectId, event) => { void appendFile(join(projectsRoot, projectId, 'logs', 'agent.jsonl'), JSON.stringify(event) + String.fromCharCode(10)); window.webContents.send(IPC.event, { projectId, event }); }, async (_projectId, paths) => {
    const details = paths.slice(0, 8).join('\n') + (paths.length > 8 ? `\n외 ${paths.length - 8}개` : '');
    const result = await dialog.showMessageBox(window, { type: 'warning', title: '저장된 데이터 변경', message: '저장된 데이터가 변경됩니다.', detail: `변경 대상:\n${details}\n\n계속 진행할까요?`, buttons: ['취소', '변경 허용'], defaultId: 0, cancelId: 0, noLink: true });
    return result.response === 1;
  });
  registerIpc({ app: service, projects, runtime, agent, db });
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL); else await window.loadFile(join(import.meta.dirname, '../renderer/index.html'));

  void (async () => {
    for (const project of await projects.listProjects()) {
      if (project.status !== 'running') continue;
      try {
        const info = await runtime.start(project.id);
        await projects.updateProject(project.id, { appUrl: info.url });
      } catch {
        await projects.setStatus(project.id, 'failed');
      }
    }
  })();
}
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.whenReady().then(boot).catch(async (error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    await dialog.showMessageBox({ type: 'error', title: 'Buildflow 시작 오류', message: 'Buildflow를 시작하지 못했습니다.', detail: message });
    app.quit();
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); }); app.on('before-quit', (event) => { if (quitting) return; quitting = true; event.preventDefault(); void processes.dispose().finally(() => { db?.close(); app.exit(0); }); });
