import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '../src/shared/events/agent-event.js';
import type { AgentProjectContext, AgentSession, CodingAgent } from '../src/main/agents/coding-agent.js';
import { SafeApplicationService } from '../src/main/app/safe-application-service.js';
import { GitManager } from '../src/main/git/git-manager.js';
import { HarnessManager } from '../src/main/harness/harness-manager.js';
import { MetadataDatabase } from '../src/main/metadata/database.js';
import { ProcessManager } from '../src/main/processes/process-manager.js';
import { ProjectManager } from '../src/main/projects/project-manager.js';
import type { RuntimeManager } from '../src/main/runtime/runtime-manager.js';
import type { ValidationManager } from '../src/main/validation/validation-manager.js';
import { WorkspaceTransactionManager } from '../src/main/workspaces/workspace-transaction.js';

class EditingAgent implements CodingAgent {
  readonly id = 'test';
  async isInstalled() { return true; }
  async startSession(context: AgentProjectContext): Promise<AgentSession> { return { ...context, id: 'session' }; }
  async *execute(session: AgentSession): AsyncIterable<AgentEvent> {
    await writeFile(join(session.workspacePath, 'app.txt'), 'changed');
    yield { type: 'editing' };
  }
  async cancel() {}
}

class DeletingDataAgent extends EditingAgent {
  async *execute(session: AgentSession): AsyncIterable<AgentEvent> {
    await rm(join(session.workspacePath, 'data'), { recursive: true, force: true });
    await writeFile(join(session.workspacePath, 'app.txt'), 'changed');
    yield { type: 'editing' };
  }
}

class FakeRuntime {
  private active = true;
  starts = 0;
  getInfo(projectId: string) { return this.active ? { projectId, url: 'http://127.0.0.1:45000', port: 45000 } : undefined; }
  async stop() { this.active = false; }
  async start(projectId: string) { this.active = true; this.starts++; return this.getInfo(projectId)!; }
}

describe('create, modify, and recover flow', () => {
  const roots: string[] = [];
  const processes: ProcessManager[] = [];
  const databases: MetadataDatabase[] = [];
  afterEach(async () => {
    for (const database of databases.splice(0)) database.close();
    for (const process of processes.splice(0)) await process.dispose();
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });

  async function setup(agent: CodingAgent = new EditingAgent(), approveDataChange: (projectId: string, paths: string[]) => Promise<boolean> = async () => false) {
    const root = await mkdtemp(join(tmpdir(), 'buildflow-flow-')); roots.push(root);
    const projects = new ProjectManager(join(root, 'projects'));
    const project = await projects.createProject('테스트 프로그램');
    await writeFile(join(project.workspacePath, 'app.txt'), 'healthy');
    await mkdir(join(project.workspacePath, 'data'));
    await writeFile(join(project.workspacePath, 'data', 'user.sqlite'), 'user data');
    const process = new ProcessManager(); processes.push(process);
    const git = new GitManager(process);
    const database = new MetadataDatabase(join(root, 'metadata.sqlite')); databases.push(database);
    const original = await git.commit(project.id, project.workspacePath, project.description);
    database.add(original);
    await projects.setStatus(project.id, 'running');
    const runtime = new FakeRuntime();
    let validationFails = false;
    const validation = { validate: async () => { if (validationFails) throw new Error('validation failed'); } } as unknown as ValidationManager;
    const events: AgentEvent[] = [];
    const service = new SafeApplicationService(projects, new HarnessManager(), agent, validation, git, runtime as unknown as RuntimeManager, database, new WorkspaceTransactionManager(), (_id, event) => events.push(event), approveDataChange);
    return { project, projects, git, database, runtime, service, events, original, failValidation: () => { validationFails = true; } };
  }

  it('keeps the last healthy app and user data when modification validation fails', async () => {
    const { project, projects, git, database, runtime, service, events, failValidation } = await setup();
    failValidation();
    await expect(service.modify(project.id, 'change it')).rejects.toThrow('기존 프로그램은 그대로');
    expect(await readFile(join(project.workspacePath, 'app.txt'), 'utf8')).toBe('healthy');
    expect(await readFile(join(project.workspacePath, 'data', 'user.sqlite'), 'utf8')).toBe('user data');
    expect((await projects.getProject(project.id)).status).toBe('running');
    expect(runtime.getInfo(project.id)).toBeDefined();
    expect(database.list(project.id)).toHaveLength(1);
    await expect(git.ensureClean(project.workspacePath)).resolves.toBeUndefined();
    expect(events.at(-1)?.type).toBe('failed');
  });

  it('rejects unapproved data deletion and preserves the healthy app', async () => {
    const { project, service } = await setup(new DeletingDataAgent());
    await expect(service.modify(project.id, 'change appearance')).rejects.toThrow('기존 프로그램은 그대로');
    expect(await readFile(join(project.workspacePath, 'app.txt'), 'utf8')).toBe('healthy');
    expect(await readFile(join(project.workspacePath, 'data', 'user.sqlite'), 'utf8')).toBe('user data');
  });

  it('applies a data change only after approval with the affected path', async () => {
    const approvals: string[][] = [];
    const { project, service } = await setup(new DeletingDataAgent(), async (_id, paths) => { approvals.push(paths); return true; });
    await service.modify(project.id, 'clear data');
    expect(approvals[0]).toContain(join('data', 'user.sqlite'));
    expect(await readFile(join(project.workspacePath, 'app.txt'), 'utf8')).toBe('changed');
    await expect(readFile(join(project.workspacePath, 'data', 'user.sqlite'), 'utf8')).rejects.toThrow();
  });

  it('restores an earlier version after a successful change and keeps user data', async () => {
    const { project, projects, database, runtime, service, original } = await setup();
    await service.modify(project.id, 'change it');
    expect(await readFile(join(project.workspacePath, 'app.txt'), 'utf8')).toBe('changed');
    expect(database.list(project.id)).toHaveLength(2);
    const changedVersion = database.list(project.id).find((version) => version.id !== original.id)!;

    await service.rollback(project.id, original.id);
    expect(await readFile(join(project.workspacePath, 'app.txt'), 'utf8')).toBe('healthy');
    expect(await readFile(join(project.workspacePath, 'data', 'user.sqlite'), 'utf8')).toBe('user data');
    expect(database.list(project.id)).toHaveLength(3);
    expect((await projects.getProject(project.id)).status).toBe('running');
    expect(runtime.getInfo(project.id)).toBeDefined();
    await service.rollback(project.id, changedVersion.id);
    expect(await readFile(join(project.workspacePath, 'app.txt'), 'utf8')).toBe('changed');
    expect(database.list(project.id)).toHaveLength(4);
  });

  it('retains the current version when rollback validation fails', async () => {
    const { project, database, runtime, service, original, failValidation } = await setup();
    await service.modify(project.id, 'change it');
    failValidation();
    await expect(service.rollback(project.id, original.id)).rejects.toThrow('현재 프로그램은 그대로');
    expect(await readFile(join(project.workspacePath, 'app.txt'), 'utf8')).toBe('changed');
    expect(database.list(project.id)).toHaveLength(2);
    expect(runtime.getInfo(project.id)).toBeDefined();
  });
});
