import type { AgentEvent } from '../../shared/events/agent-event.js';
import type { CodingAgent } from '../agents/coding-agent.js';
import type { GitManager } from '../git/git-manager.js';
import type { HarnessManager } from '../harness/harness-manager.js';
import type { MetadataDatabase } from '../metadata/database.js';
import type { ProjectManager } from '../projects/project-manager.js';
import type { RuntimeManager } from '../runtime/runtime-manager.js';
import type { ValidationManager } from '../validation/validation-manager.js';
import type { WorkspaceTransaction, WorkspaceTransactionManager } from '../workspaces/workspace-transaction.js';

const initialPrompt = (request: string) => `Create the requested application in the current workspace.
Follow AGENTS.md and the files under .agent/.
Use Next.js and TypeScript. Use SQLite for persistent user data; localStorage must not be the primary store.
Use versioned, idempotent database migrations. Include typecheck and primary-flow tests.
The app must have production build/start commands and GET /api/health returning HTTP 200.
Do not use Git or start a persistent server. Finish only after validation passes.

User request:
${request}`;

export class SafeApplicationService {
  constructor(
    private projects: ProjectManager, private harness: HarnessManager, private agent: CodingAgent,
    private validation: ValidationManager, private git: GitManager, private runtime: RuntimeManager,
    private db: MetadataDatabase, private workspaces: WorkspaceTransactionManager,
    private send: (projectId: string, event: AgentEvent) => void,
    private approveUserDataChange: (projectId: string, paths: string[]) => Promise<boolean> = async () => false,
  ) {}

  private async runAgent(projectId: string, workspacePath: string, prompt: string) {
    const session = await this.agent.startSession({ projectId, workspacePath });
    for await (const event of this.agent.execute(session, prompt)) this.send(projectId, event);
  }

  private async restorePrevious(projectId: string, wasRunning: boolean, transaction?: WorkspaceTransaction, activated = false) {
    if (activated) await this.runtime.stop(projectId);
    if (transaction) {
      if (activated) await this.workspaces.rollback(transaction);
      else await this.workspaces.discard(transaction);
    }
    if (wasRunning) {
      const info = this.runtime.getInfo(projectId) ?? await this.runtime.start(projectId);
      await this.projects.updateProject(projectId, { status: 'running', appUrl: info.url });
    } else {
      await this.projects.setStatus(projectId, 'ready');
    }
  }

  async create(description: string) {
    const project = await this.projects.createProject(description);
    try {
      await this.harness.inject(project.workspacePath, description);
      await this.runAgent(project.id, project.workspacePath, initialPrompt(description));
      this.send(project.id, { type: 'testing' });
      await this.validation.validate(project.workspacePath, (stream, data) => this.send(project.id, { type: 'raw', stream, data }));
      this.send(project.id, { type: 'saving-version' });
      this.db.add(await this.git.commit(project.id, project.workspacePath, description));
      this.send(project.id, { type: 'starting-app' });
      const runtime = await this.runtime.start(project.id);
      const ready = await this.projects.updateProject(project.id, { status: 'running', appUrl: runtime.url });
      this.send(project.id, { type: 'completed', summary: '프로그램이 준비되었습니다.' });
      return ready;
    } catch (error) {
      await this.projects.setStatus(project.id, 'failed');
      this.send(project.id, { type: 'raw', stream: 'stderr', data: String(error) });
      this.send(project.id, { type: 'failed', message: '프로그램을 완성하지 못했습니다. 검증 다시 시도를 눌러 다시 확인할 수 있습니다.' });
      throw new Error('프로그램을 완성하지 못했습니다. 검증 다시 시도를 눌러 다시 확인할 수 있습니다.');
    }
  }

  async retry(projectId: string) {
    const project = await this.projects.getProject(projectId);
    if (project.status !== 'failed') throw new Error('실패한 프로젝트만 다시 검증할 수 있습니다.');
    try {
      this.send(projectId, { type: 'testing' });
      await this.validation.validate(project.workspacePath, (stream, data) => this.send(projectId, { type: 'raw', stream, data }));
      if (this.db.list(projectId).length === 0) {
        this.send(projectId, { type: 'saving-version' });
        this.db.add(await this.git.commit(projectId, project.workspacePath, project.description));
      }
      this.send(projectId, { type: 'starting-app' });
      const runtime = await this.runtime.start(projectId);
      const ready = await this.projects.updateProject(projectId, { status: 'running', appUrl: runtime.url });
      this.send(projectId, { type: 'completed', summary: '프로그램이 준비되었습니다.' });
      return ready;
    } catch (error) {
      this.send(projectId, { type: 'raw', stream: 'stderr', data: String(error) });
      this.send(projectId, { type: 'failed', message: '프로그램을 실행하지 못했습니다. 상세 로그에서 원인을 확인할 수 있습니다.' });
      throw new Error('프로그램을 실행하지 못했습니다. 상세 로그에서 원인을 확인할 수 있습니다.');
    }
  }

  async modify(projectId: string, request: string) {
    const project = await this.projects.getProject(projectId);
    await this.git.ensureClean(project.workspacePath);
    const wasRunning = !!this.runtime.getInfo(projectId);
    await this.projects.setStatus(projectId, 'modifying');
    let tx: WorkspaceTransaction | undefined;
    let activated = false;
    try {
      await this.runtime.stop(projectId);
      tx = await this.workspaces.stage(project.workspacePath);
      await this.runAgent(projectId, tx.stagedPath, `Modify the existing app for this request. Follow AGENTS.md. Do not use Git or start a server. Validate before finishing.\n\n${request}`);
      this.send(projectId, { type: 'testing' });
      await this.validation.validate(tx.stagedPath, (stream, data) => this.send(projectId, { type: 'raw', stream, data }));
      const dataChanges = await this.workspaces.userDataChanges(tx);
      if (dataChanges.length && !await this.approveUserDataChange(projectId, dataChanges)) throw new Error('기존 데이터 변경이 승인되지 않았습니다.');
      const version = await this.git.commit(projectId, tx.stagedPath, request);
      this.send(projectId, { type: 'saving-version' });
      await this.workspaces.activate(tx);
      activated = true;
      this.send(projectId, { type: 'starting-app' });
      const info = await this.runtime.start(projectId);
      const ready = await this.projects.updateProject(projectId, { status: 'running', appUrl: info.url });
      this.db.add(version);
      await this.workspaces.finalize(tx).catch(() => undefined);
      this.send(projectId, { type: 'completed', summary: '변경이 적용되었습니다.' });
      return ready;
    } catch (error) {
      try { await this.restorePrevious(projectId, wasRunning, tx, activated); }
      catch (recoveryError) {
        await this.projects.setStatus(projectId, 'failed').catch(() => undefined);
        this.send(projectId, { type: 'raw', stream: 'stderr', data: `Recovery failed: ${String(recoveryError)}` });
        this.send(projectId, { type: 'failed', message: '기존 프로그램을 자동으로 복구하지 못했습니다.' });
        throw new Error('기존 프로그램을 자동으로 복구하지 못했습니다.');
      }
      this.send(projectId, { type: 'raw', stream: 'stderr', data: String(error) });
      this.send(projectId, { type: 'failed', message: '변경을 적용하지 못했습니다. 기존 프로그램은 그대로 사용할 수 있습니다.' });
      throw new Error('변경을 적용하지 못했습니다. 기존 프로그램은 그대로 사용할 수 있습니다.');
    }
  }

  async rollback(projectId: string, versionId: string) {
    const project = await this.projects.getProject(projectId), version = this.db.get(versionId);
    if (!version || version.projectId !== projectId) throw new Error('Version not found');
    const wasRunning = !!this.runtime.getInfo(projectId);
    let tx: WorkspaceTransaction | undefined;
    let activated = false;
    try {
      await this.runtime.stop(projectId);
      tx = await this.workspaces.stage(project.workspacePath);
      await this.git.checkoutTree(tx.stagedPath, version.commitHash);
      this.send(projectId, { type: 'testing' });
      await this.validation.validate(tx.stagedPath, (stream, data) => this.send(projectId, { type: 'raw', stream, data }));
      await this.git.checkoutTree(tx.stagedPath, version.commitHash);
      const restoredVersion = await this.git.commit(projectId, tx.stagedPath, `이전 버전으로 되돌리기: ${version.request}`, true);
      this.send(projectId, { type: 'saving-version' });
      await this.workspaces.activate(tx);
      activated = true;
      this.send(projectId, { type: 'starting-app' });
      const info = await this.runtime.start(projectId);
      const ready = await this.projects.updateProject(projectId, { status: 'running', appUrl: info.url });
      this.db.add(restoredVersion);
      await this.workspaces.finalize(tx).catch(() => undefined);
      this.send(projectId, { type: 'completed', summary: '이전 버전으로 되돌렸습니다.' });
      return ready;
    } catch (error) {
      try { await this.restorePrevious(projectId, wasRunning, tx, activated); }
      catch (recoveryError) {
        await this.projects.setStatus(projectId, 'failed').catch(() => undefined);
        this.send(projectId, { type: 'raw', stream: 'stderr', data: `Recovery failed: ${String(recoveryError)}` });
        this.send(projectId, { type: 'failed', message: '기존 프로그램을 자동으로 복구하지 못했습니다.' });
        throw new Error('기존 프로그램을 자동으로 복구하지 못했습니다.');
      }
      this.send(projectId, { type: 'raw', stream: 'stderr', data: String(error) });
      this.send(projectId, { type: 'failed', message: '이전 버전으로 되돌리지 못했습니다. 현재 프로그램은 그대로 사용할 수 있습니다.' });
      throw new Error('이전 버전으로 되돌리지 못했습니다. 현재 프로그램은 그대로 사용할 수 있습니다.');
    }
  }
}
