---
type: Runbook
title: Local development
description: Start Supabase and the Next.js application with safe local checks.
tags: [runbook, local, supabase]
status: stable
generated: { by: process:realized-dev-harness-init, at: 2026-09-15T00:00:00Z }
---

# Start

1. Run `pnpm harness:doctor`.
2. Run `pnpm verify:local` when local verification is pending.
3. Run `pnpm dev`.

# Verify

Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
`pnpm test:integration`, `pnpm test:e2e`, and `pnpm build` as appropriate
for the changed surface.

`verify:local` resets the local database, applies migrations and seeds, lints
the database, runs every configured quality gate, and records the migration
fingerprint only after complete success. Use `pnpm work-item -- create`,
`triage`, and `dispatch` to mutate canonical work-item metadata, then run
`pnpm harness:lint`.

# Stop

Run `pnpm exec supabase stop`. Never copy local service-role credentials into
tracked files or logs.

# Recovery

| Diagnostic | Recovery |
| --- | --- |
| Docker CLI missing | Install Docker Desktop or Docker Engine. |
| Docker daemon unreachable | Start Docker, then run `pnpm verify:local` on a Docker-capable host. |
| Supabase verification pending | Run `pnpm verify:local`; mocks and remote databases are not substitutes. |
| CodeRabbit disabled for a web IDE task | Enable CodeRabbit from task actions, then rerun `coderabbit review --agent -t uncommitted`. |
| CodeRabbit remains unavailable | Report the external runtime blocker; do not run login commands or inject API keys. |
| Harness update available | Run `pnpm harness:upgrade -- --dry-run`, resolve collisions, then use `--apply`. |

CodeRabbit's emulate v0.0.1 catalog does not include Supabase and cannot verify
PostgreSQL, Auth, REST, migrations, or row-level security.
