# Architecture

Buildflow is a local control plane for generated applications.

## Components

```text
React renderer
  ↓ typed preload API
Electron main process
  ├─ ProjectManager       metadata and workspace layout
  ├─ CodingAgent          Codex adapter boundary
  ├─ ProcessManager       every child process lifecycle
  ├─ HarnessManager       per-project agent rules
  ├─ ValidationManager    install, typecheck, build, tests
  ├─ GitManager           internal working-version engine
  ├─ WorkspaceTransaction staged change and recovery
  └─ RuntimeManager       local server and health checks
```

The renderer has no Node.js access. `contextIsolation` and the Electron sandbox are enabled, `nodeIntegration` is disabled, and IPC inputs are parsed with Zod in the main process.

## Create transaction

1. Create a workspace and agent harness.
2. Ask the coding agent to create the app in that workspace.
3. Install dependencies and run typecheck, production build, and tests.
4. Commit the validated tree to the workspace's private local Git repository.
5. Start the production server on an ephemeral loopback port.
6. Require HTTP 200 from `/api/health` before showing the app as ready.

## Modify transaction

1. Stop the current runtime.
2. Copy source into a staged sibling workspace, excluding dependency and build caches.
3. Run the coding agent and full validation against the stage.
4. Compare persistent data against the live workspace and request approval if it changed.
5. Commit the validated stage.
6. Atomically swap the stage into the live path and start it.
7. If validation or startup fails, restore the previous workspace and runtime.

## Recovery transaction

Recovery checks out a selected tree into a stage without moving the repository head backwards. It validates that tree, records recovery as a new commit, atomically activates it, and health-checks the runtime. This preserves both earlier and later versions in history.

## Data boundary

Generated applications use SQLite or local files. The transaction manager recognizes `data/`, `storage/`, `uploads/`, and root SQLite/DB files as persisted user data. A modification that changes these paths requires explicit approval before activation. Runtime data is excluded from local version commits.

## Trust assumptions

- Codex CLI is installed and authenticated by the user.
- Generated code is untrusted until validation succeeds.
- Generated app servers bind to `127.0.0.1` only.
- Buildflow does not expose a public tunnel or cloud runner.
- The local OS account remains the ultimate filesystem security boundary.
