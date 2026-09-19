import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProcessManager } from '../processes/process-manager.js';
import { npmCommand } from '../processes/npm-command.js';

export type ValidationListener = (stream: 'stdout' | 'stderr', data: string) => void;
export class ValidationManager {
  constructor(private processes: ProcessManager) {}
  private async run(cwd: string, args: string[], onData: ValidationListener, timeoutMs: number) {
    const p = this.processes.spawn({ ...npmCommand(args), cwd, timeoutMs }); p.on('stdout', (d) => onData('stdout', String(d))); p.on('stderr', (d) => onData('stderr', String(d))); const r = await p.completion; if (r.exitCode !== 0) throw new Error(`Validation command failed: npm ${args.join(' ')}`);
  }
  async validate(cwd: string, onData: ValidationListener = () => {}) {
    const packagePath = join(cwd, 'package.json'); await access(packagePath); const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    if (!pkg.dependencies?.next || !pkg.dependencies?.react || !pkg.devDependencies?.typescript) throw new Error('Generated apps must use Next.js, React, and TypeScript');
    if (!pkg.scripts?.typecheck || !pkg.scripts?.test || !pkg.scripts?.build || !pkg.scripts?.start) throw new Error('Typecheck, test, build, and start commands are required');
    await this.run(cwd, ['install', '--no-audit', '--no-fund'], onData, 10 * 60_000);
    await this.run(cwd, ['run', 'typecheck'], onData, 5 * 60_000);
    if (pkg.scripts?.lint) await this.run(cwd, ['run', 'lint'], onData, 5 * 60_000);
    await this.run(cwd, ['run', 'build'], onData, 10 * 60_000);
    await this.run(cwd, ['test', '--', '--run'], onData, 5 * 60_000);
  }
}
