import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const agents = `You are developing an application managed by this desktop platform.
The end user is not a developer.
Follow the existing architecture unless a change is necessary.
Keep changes unrelated to the user request to a minimum.
Do not modify files outside this project workspace.
Do not delete or overwrite existing user data in data/, storage/, uploads/, or SQLite files. If the request requires destructive data changes, stop and ask for user approval.
Do not expose technical implementation details to the end user.
After every requested change:
1. implement the requested feature
2. run validation
3. fix validation errors
4. leave the project in a runnable state
Do not initialize or manipulate Git unless explicitly instructed by the platform.
Do not start long-running development servers yourself.
The platform manages versioning and application runtime.
`;
export class HarnessManager {
  async inject(workspace: string, description: string) {
    const skills = join(workspace, '.agent', 'skills'); await mkdir(skills, { recursive: true });
    await Promise.all([
      writeFile(join(workspace, 'AGENTS.md'), agents),
      writeFile(join(workspace, '.gitignore'), `node_modules
.next
*.tsbuildinfo
.tools
.env*
data/
storage/
uploads/
*.sqlite
*.sqlite-*
*.db
*.db-*
`),
      writeFile(join(workspace, '.agent', 'project.md'), `# User request\n\n${description}\n`),
      writeFile(join(workspace, '.agent', 'architecture.md'), '# Architecture\n\nNext.js and TypeScript. SQLite is mandatory for persistent user data; localStorage is not the primary store. Keep schema migrations idempotent and versioned. Include GET /api/health returning HTTP 200.\n'),
      writeFile(join(skills, 'coding.md'), '# Coding\n\nPrefer simple accessible UI. Keep all dependencies local and avoid external services.\n'),
      writeFile(join(skills, 'testing.md'), '# Testing\n\nRun the production build and any available tests. Fix failures before finishing.\n'),
      writeFile(join(skills, 'release.md'), '# Release\n\nDo not use Git and do not start a persistent server. The desktop platform owns both.\n'),
    ]);
  }
}
