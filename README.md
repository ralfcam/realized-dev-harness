# Realized development harness

A Cursor-native bootstrap harness for specification-driven and test-driven
Next.js + Supabase projects.

Open this repository in Cursor and run `/init <project-name>`. The command
scaffolds the official `with-supabase` example into this checkout, configures
pnpm, local Supabase, Vitest, Playwright, and an OKF v0.2 documentation bundle.
Run `/doctor` first. If Docker is temporarily unavailable, use the explicit
scaffold-only initialization and finish later with `/verify-local`.

Linear and CodeRabbit are recommended opt-in profiles. The core lifecycle and
the canonical work queue remain local under `docs/`.

Bootstrap inputs are pinned in `.cursor/bootstrap/manifest.json`. Use
`pnpm harness:upgrade -- --dry-run` before applying a bundled harness upgrade;
version changes require the cross-platform and Docker-backed bootstrap
workflows to pass.

See [the operator guide](.cursor/README.md) and [knowledge index](docs/index.md).
