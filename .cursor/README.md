# Generic SDD/TDD operator harness

`docs/` is the source of truth. Specifications define acceptance, work-item
concepts define the queue, and code/tests provide implementation evidence.
Linear may mirror work items; it never owns them.

## Bootstrap

Run `/doctor`, then `/init <project-name>`. Initialization performs a
guarded in-place bootstrap and leaves all changes uncommitted. When Docker is
unavailable, explicit scaffold-only initialization can be completed later with
`/verify-local`. CodeRabbit and Linear are explicit profiles.

The bootstrap manifest pins the template, generator, test tools, Node minimum,
and pnpm version. Initialization checkpoints resume by phase. Use
`/upgrade-harness` for dry-run-first, collision-safe harness migrations.

The harness must ship in its pre-`/init` state. Before releasing it, run
`pnpm harness:release-check`; the check refuses initialized configuration,
local verification evidence, runtime state, credentials, and scaffolded
application files. `/init` removes this distribution-only check from the
generated project.

## Lifecycle

`/capture` → `/triage` → `/dispatch` → `/design` →
`/sdd-to-tdd` → `/review` → `/commit` → `/push` →
`/ready-merge-release`

- `/audit` verifies specs against code and tests.
- `/intake` verifies Cursor Cloud pull requests.
- `/reflect` checks claims against current evidence.
- `/tldr` summarizes a plan, spec, or work item.

All project-specific values come from [`harness.json`](harness.json).
Runtime hook state is ignored and created on demand.
