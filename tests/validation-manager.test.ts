import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ProcessManager } from '../src/main/processes/process-manager.js';
import { ValidationManager } from '../src/main/validation/validation-manager.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it('rejects a generated app without a primary test command before installing dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildflow-validation-')); roots.push(root);
  await writeFile(join(root, 'package.json'), JSON.stringify({
    dependencies: { next: '15.5.25', react: '19.3.0' },
    devDependencies: { typescript: '5.9.3' },
    scripts: { typecheck: 'tsc --noEmit', build: 'next build', start: 'next start' },
  }));
  const processes = new ProcessManager();
  try { await expect(new ValidationManager(processes).validate(root)).rejects.toThrow('Typecheck, test, build, and start'); }
  finally { await processes.dispose(); }
});
