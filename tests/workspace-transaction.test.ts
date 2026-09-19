import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceTransactionManager } from '../src/main/workspaces/workspace-transaction.js';

describe('WorkspaceTransactionManager', () => {
  it('activates a staged workspace and finalizes the backup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workspace-tx-')), live = join(root, 'workspace');
    await mkdir(live); await writeFile(join(live, 'value.txt'), 'old');
    const manager = new WorkspaceTransactionManager(), tx = await manager.stage(live);
    await writeFile(join(tx.stagedPath, 'value.txt'), 'new');
    await manager.activate(tx);
    expect(await readFile(join(live, 'value.txt'), 'utf8')).toBe('new');
    await manager.finalize(tx);
    await expect(access(tx.backupPath)).rejects.toThrow();
  });

  it('restores the live workspace after an activation failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workspace-tx-')), live = join(root, 'workspace');
    await mkdir(live); await writeFile(join(live, 'value.txt'), 'healthy');
    const manager = new WorkspaceTransactionManager(), tx = await manager.stage(live);
    await writeFile(join(tx.stagedPath, 'value.txt'), 'broken');
    await manager.activate(tx); await manager.rollback(tx);
    expect(await readFile(join(live, 'value.txt'), 'utf8')).toBe('healthy');
  });

  it('does not copy build products into staging', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workspace-tx-')), live = join(root, 'workspace');
    await mkdir(join(live, 'node_modules'), { recursive: true }); await mkdir(join(live, '.next'), { recursive: true });
    await writeFile(join(live, 'source.ts'), 'ok'); await writeFile(join(live, 'node_modules', 'ignored'), 'x');
    const tx = await new WorkspaceTransactionManager().stage(live);
    expect(await readFile(join(tx.stagedPath, 'source.ts'), 'utf8')).toBe('ok');
    await expect(access(join(tx.stagedPath, 'node_modules'))).rejects.toThrow();
  });
});
