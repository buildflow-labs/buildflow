import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HarnessManager } from '../src/main/harness/harness-manager.js';
import { ProjectManager } from '../src/main/projects/project-manager.js';

describe('project workspace and harness', () => {
  it('creates an isolated workspace and injects guardrails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buildflow-test-')); const projects = new ProjectManager(root);
    const p = await projects.createProject('할 일 앱'); await new HarnessManager().inject(p.workspacePath, p.description);
    expect((await projects.getProject(p.id)).workspacePath).toBe(p.workspacePath);
    const text = await readFile(join(p.workspacePath, 'AGENTS.md'), 'utf8');
    expect(text).toContain('Do not initialize or manipulate Git'); expect(text).toContain('Do not start long-running');
  });
});
