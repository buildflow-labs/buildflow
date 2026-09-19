import type { SpawnOptions } from './process-manager.js';

export function npmCommand(args: string[]): Pick<SpawnOptions, 'executable' | 'args'> {
  return process.platform === 'win32'
    ? { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', ...args] }
    : { executable: 'npm', args };
}
