import { randomUUID } from 'node:crypto';
import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '../../shared/events/agent-event.js';
import { captureProcess, ProcessManager } from '../processes/process-manager.js';
import type { AgentProjectContext, AgentSession, CodingAgent } from './coding-agent.js';

class AsyncQueue<T> {
  private values: T[] = []; private waiters: Array<(v: IteratorResult<T>) => void> = []; private ended = false;
  push(v: T) { const w = this.waiters.shift(); w ? w({ value: v, done: false }) : this.values.push(v); }
  end() { this.ended = true; for (const w of this.waiters.splice(0)) w({ value: undefined, done: true }); }
  async *iterate() { while (true) { if (this.values.length) yield this.values.shift()!; else if (this.ended) return; else { const r = await new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve)); if (r.done) return; yield r.value; } } }
}

export class CodexAgent implements CodingAgent {
  readonly id = 'codex'; private sessions = new Map<string, string>();
  private executable?: Promise<string>;
  constructor(private processes: ProcessManager) {}
  private resolveExecutable() {
    return this.executable ??= (async () => {
      if (process.env.CODEX_PATH) return process.env.CODEX_PATH;
      if (process.platform === 'win32') {
        const extensions = join(homedir(), '.vscode', 'extensions');
        const entries = await readdir(extensions).catch(() => []);
        const candidates = entries
          .filter((name) => name.startsWith('openai.chatgpt-'))
          .sort().reverse()
          .map((name) => join(extensions, name, 'bin', 'windows-x86_64', 'codex.exe'));
        for (const candidate of candidates) {
          if (await access(candidate).then(() => true).catch(() => false)) return candidate;
        }
      }
      return 'codex';
    })();
  }
  async isInstalled() { try { return (await captureProcess(this.processes, { executable: await this.resolveExecutable(), args: ['--version'], cwd: process.cwd(), timeoutMs: 5_000 })).exitCode === 0; } catch { return false; } }
  async version() { const r = await captureProcess(this.processes, { executable: await this.resolveExecutable(), args: ['--version'], cwd: process.cwd(), timeoutMs: 5_000 }); return r.exitCode === 0 ? r.stdout.trim() : undefined; }
  async startSession(context: AgentProjectContext) { const session = { ...context, id: randomUUID() }; this.sessions.set(session.id, ''); return session; }
  async *execute(session: AgentSession, prompt: string): AsyncIterable<AgentEvent> {
    const queue = new AsyncQueue<AgentEvent>(); queue.push({ type: 'analyzing', message: '요청을 확인하고 있습니다.' });
    const args = ['--approve-for-me', 'exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--cd', session.workspacePath, prompt];
    const proc = this.processes.spawn({ executable: await this.resolveExecutable(), args, cwd: session.workspacePath, projectId: session.projectId, timeoutMs: 30 * 60_000 }); this.sessions.set(session.id, proc.id);
    let pending = ''; let editingSent = false; let failure: Error | undefined;
    proc.on('stdout', (chunk: string) => {
      queue.push({ type: 'raw', stream: 'stdout', data: chunk });
      pending += chunk;
      const lines = pending.split('\n'); pending = lines.pop() || '';
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          const item = event.item as Record<string, unknown> | undefined;
          if (!editingSent && (item?.type === 'file_change' || item?.type === 'command_execution')) {
            queue.push({ type: 'editing', message: '프로그램을 작성하고 있습니다.' });
            editingSent = true;
          }
        } catch { /* Keep the raw output for diagnostics. */ }
      }
    });
    proc.on('stderr', (data: string) => queue.push({ type: 'raw', stream: 'stderr', data }));
    proc.completion.then(({ exitCode }) => { if (exitCode !== 0) failure = new Error(`코딩 작업이 종료 코드 ${exitCode}로 실패했습니다.`); queue.end(); this.sessions.delete(session.id); }).catch((e: Error) => { failure = e; queue.end(); this.sessions.delete(session.id); });
    yield* queue.iterate();
    if (failure) throw failure;
  }
  async cancel(sessionId: string) { const id = this.sessions.get(sessionId); if (id) await this.processes.terminate(id); }
}
