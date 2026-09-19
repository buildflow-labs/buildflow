# Security policy

## Supported versions

Buildflow is pre-1.0. Security fixes are applied to the latest release and the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's **Security → Report a vulnerability** flow for this repository. Include:

- affected version and operating system
- reproduction steps or a proof of concept
- expected impact
- any suggested mitigation

You should receive an acknowledgement within 72 hours. We aim to provide an initial assessment within seven days and coordinate disclosure after a fix is available.

## Security model

Buildflow runs generated code locally. It reduces risk through Electron renderer isolation, validated IPC, Codex workspace sandboxing, staged modifications, validation before activation, loopback-only app servers, and explicit approval for persisted data changes.

These controls reduce risk but do not make arbitrary generated code safe. Review advanced logs when behavior is unexpected, keep Codex and Buildflow updated, and do not enter secrets into generated apps unless you understand how that app stores them.
