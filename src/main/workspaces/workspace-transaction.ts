import { cp, lstat, mkdir, readdir, readFile, readlink, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';

export type WorkspaceTransaction = { livePath: string; stagedPath: string; backupPath: string };

export class WorkspaceTransactionManager {
  async stage(livePath: string): Promise<WorkspaceTransaction> {
    const root = join(dirname(livePath), '.transactions');
    await mkdir(root, { recursive: true });
    const id = randomUUID();
    const transaction = { livePath, stagedPath: join(root, `${id}-staged`), backupPath: join(root, `${id}-backup`) };
    await cp(livePath, transaction.stagedPath, {
      recursive: true,
      filter: (source) => !relative(livePath, source).split(sep).some((part) => part === 'node_modules' || part === '.next'),
    });
    return transaction;
  }

  async activate(transaction: WorkspaceTransaction): Promise<void> {
    await rename(transaction.livePath, transaction.backupPath);
    try {
      await rename(transaction.stagedPath, transaction.livePath);
    } catch (error) {
      await rename(transaction.backupPath, transaction.livePath).catch(() => undefined);
      throw error;
    }
  }

  async userDataChanges(transaction: WorkspaceTransaction): Promise<string[]> {
    const collect = async (root: string) => {
      const entries = new Map<string, string>();
      const walk = async (path: string, relativePath: string) => {
        const item = await lstat(path).catch(() => undefined);
        if (!item) return;
        if (item.isDirectory()) {
          entries.set(`${relativePath}/`, 'directory');
          for (const child of await readdir(path, { withFileTypes: true })) await walk(join(path, child.name), join(relativePath, child.name));
        } else if (item.isFile()) {
          entries.set(relativePath, createHash('sha256').update(await readFile(path)).digest('hex'));
        } else {
          entries.set(relativePath, `link:${await readlink(path).catch(() => '')}`);
        }
      };
      for (const name of ['data', 'storage', 'uploads']) await walk(join(root, name), name);
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (/\.(?:sqlite|db)(?:-(?:wal|shm|journal))?$/i.test(entry.name)) await walk(join(root, entry.name), entry.name);
      }
      return entries;
    };
    const before = await collect(transaction.livePath), after = await collect(transaction.stagedPath);
    return [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name)).sort();
  }

  async finalize(transaction: WorkspaceTransaction): Promise<void> { await rm(transaction.backupPath, { recursive: true, force: true }); }

  async rollback(transaction: WorkspaceTransaction): Promise<void> {
    const failedPath = `${transaction.stagedPath}-failed`;
    await rename(transaction.livePath, failedPath);
    try { await rename(transaction.backupPath, transaction.livePath); }
    catch (error) { await rename(failedPath, transaction.livePath); throw error; }
    await rm(failedPath, { recursive: true, force: true });
  }

  async discard(transaction: WorkspaceTransaction): Promise<void> {
    await rm(transaction.stagedPath, { recursive: true, force: true });
  }
}
