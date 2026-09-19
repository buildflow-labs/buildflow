# Contributing to Buildflow

Thanks for helping make app creation accessible to people who do not write code.

## Before you start

- Search existing issues and discussions.
- Use a discussion for broad product proposals.
- Use an issue for a reproducible bug or a scoped feature.
- Keep pull requests focused. A smaller reviewable change lands faster.

## Local setup

Requirements:

- Windows 10/11 for the currently supported desktop target
- Node.js 24+
- Git 2.23+
- Codex CLI for manual create/modify flow testing

```bash
git clone https://github.com/buildflow-labs/buildflow.git
cd buildflow
npm ci
npm run dev
```

The standard quality gate is:

```bash
npm run typecheck
npm test
npm run build
```

Run `npm run package:win` when changing Electron packaging, icons, preload behavior, or production asset paths.

## Architecture rules

1. Keep filesystem and process access in the Electron main process.
2. Add typed, Zod-validated IPC for renderer-to-main operations.
3. Never activate unvalidated generated code.
4. Preserve the last healthy app when modification or recovery fails.
5. Ask before changing existing user data.
6. Keep Git, npm, ports, and terminal concepts out of the default user interface.
7. Avoid cloud services in the core product.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing application lifecycle code.

## Tests

Tests should protect behavior with meaningful failure modes. Particularly valuable areas are:

- transaction recovery
- child process termination
- version tree correctness
- user data preservation and approval
- IPC validation
- renderer security boundaries

Do not commit generated projects, `.e2e-data`, builds, installers, or `node_modules`.

## Pull requests

- Explain the user-visible problem and the chosen solution.
- Include screenshots for visual changes.
- List the commands used to verify the change.
- Mention data migration or compatibility risks.
- Add or update tests when lifecycle, validation, recovery, or security behavior changes.

By contributing, you agree that your contribution is licensed under Apache-2.0.
