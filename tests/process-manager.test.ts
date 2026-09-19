import { afterEach, describe, expect, it } from 'vitest';
import { ProcessManager, captureProcess } from '../src/main/processes/process-manager.js';
import { npmCommand } from '../src/main/processes/npm-command.js';

describe('ProcessManager', () => {
  const manager = new ProcessManager();
  afterEach(() => manager.dispose());
  it('streams stdout and stderr and reports exit code', async () => {
    const p = manager.spawn({ executable: process.execPath, args: ['-e', "console.log('out'); console.error('err')"], cwd: process.cwd() });
    let stdout = '', stderr = ''; p.on('stdout', (v) => stdout += v); p.on('stderr', (v) => stderr += v);
    const result = await p.completion;
    expect(result.exitCode).toBe(0); expect(stdout).toContain('out'); expect(stderr).toContain('err');
  });
  it('captures command output', async () => {
    const result = await captureProcess(manager, { executable: process.execPath, args: ['-e', "process.stdout.write('ok')"], cwd: process.cwd() });
    expect(result.stdout).toBe('ok');
  });
  it('runs npm through the platform command', async () => {
    const result = await captureProcess(manager, { ...npmCommand(['--version']), cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('terminates by project', async () => {
    const p = manager.spawn({ executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd(), projectId: 'project' });
    await manager.terminateByProject('project'); const result = await p.completion;
    expect(result.signal !== null || (result.exitCode !== null && result.exitCode !== 0)).toBe(true);
  });
});
