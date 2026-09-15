# Operator harness

Map of the Cursor command cycle in this folder. Command files under
[`commands/`](commands/) are the source of truth.

Work ships on the **`staging` accumulator** (feature PR = `<head> → staging`,
then promotion = `staging →` default branch). Agents never merge. You merge
in the GitHub UI. Linear **In Progress** / **In Review** / **Done** are
automation-owned (draft/open PR, review/ready-for-merge, closing-linked merge).

Linear IDs are **`RES-###`** on the team whose key is **`RES`**. The live
team display name is informational. Linear projects are discovered dynamically:
active work routes only to live nonterminal RES projects with canonical version key **`V-X.X`**, classified ongoing/available from their Linear status
and allocated fail-closed by
[`rules/linear-project-routing.mdc`](rules/linear-project-routing.mdc).
Specs live in [`docs/specs/`](../docs/specs/).
Linear Triage is the special intake inbox. Ordinary accepted work lands in
Backlog without a cycle; `/dispatch` metadata-plans the full scoped Backlog
portfolio, then activates only the available slots in a 5–10 total-active
Todo/current-cycle queue.

Milestones are project-owned M1–M9 routes: `/design` is M1–M3
pre-implementation work; `/sdd-to-tdd` routes contract clarification to M2,
implementation to M4, and test/beta/UAT/launch/maintenance work to M5–M9.
Tracked routing/spec conflicts use one bounded `Clarification required`
comment through `linear-resolver`; the existing Linear-to-Slack relay provides
visibility. That comment never triggers In Review/Done automation.

Vercel team **ralfcams-projects** (`team_MP13K4M0To2S4Duu2kknllAb`), git-linked
project **restaurant-system** (`prj_wFVDqQOtf6cjuUXscIoHDbtHzTTz`). Dashboard:
[ralfcams-projects/restaurant-system](https://vercel.com/ralfcams-projects/restaurant-system).
MCP namespace `plugin-vercel-vercel` (`get_project` / `list_deployments` on
this `prj_`). Env vars and `vercel link` are **CLI-only** — this MCP has no
env tools. Runbook:
[`docs/runbooks/deploy.md`](../docs/runbooks/deploy.md). Rule:
[`rules/vercel-project.mdc`](rules/vercel-project.mdc).

**Plan Mode only:** [`/audit`](commands/audit.md), [`/triage`](commands/triage.md),
[`/dispatch`](commands/dispatch.md), [`/sdd-to-tdd`](commands/sdd-to-tdd.md),
[`/design`](commands/design.md).
[`/intake`](commands/intake.md) has no Plan Mode gate.

There is no GitHub QA workflow in this repo. Local gates are
`pnpm lint`, `pnpm typecheck`, and `pnpm test:unit`.

---

## Recommended cycle

`docs/findings + Linear Triage` → `/triage` → `Backlog` → `/dispatch` →
`Todo/current cycle` → (`/sdd-to-tdd` → `/commit` → `/push`)×N →
`/ready-merge-release PR#` → you merge

`/audit` remains spec-first and writes findings to the ledger, then publishes
one idempotent project-health digest through `linear-resolver`. Linear is
visibility only, never the audit acceptance bar.

- **Greenfield (no owning spec):** idea → [`/design`](commands/design.md) →
  new `docs/specs/<slug>.md` → `/sdd-to-tdd @<file>` FEATURE
- **Cloud Agent PR:** [`/intake`](commands/intake.md) for
  `cursor/<slug>-<4 hex>` heads. Run `/intake` **before** `/push` on the
  local lane when such a PR is open.

```mermaid
flowchart TD
  subgraph snapshot [Snapshot]
    Audit["/audit spec-first"]
    Audit --> Ledger["docs/findings"]
    Audit --> ProjectHealth["Linear project health"]
  end
  subgraph adhoc [Ad-hoc]
    Capture["/capture"]
    Design["/design"]
    Capture --> Ledger
    Design --> Spec["docs/specs new file"]
  end
  LinearTriage["Linear Triage inbox"] --> Triage["/triage intake"]
  Ledger --> Triage
  Triage --> Backlog["Backlog / no cycle"]
  Backlog --> Dispatch["/dispatch portfolio + daily wave"]
  Dispatch --> Todo["Todo / current cycle"]
  Spec --> Sdd["/sdd-to-tdd FEATURE"]
  Todo --> Sdd2["/sdd-to-tdd RES-###"]
  Sdd --> Commit["/commit"]
  Sdd2 --> Commit
  Commit --> Push["/push"]
  Push --> CR["CodeRabbit reviews draft"]
  CR --> Release["/ready-merge-release PR#"]
  Release --> Merge["You merge in GitHub"]
  CloudPR["cursor/slug-abcd PR"] --> Intake["/intake"]
  Intake --> Release
```

---

## Command map

| Command                                                   | Job                                                                                                                | Typical next                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| [`/audit`](commands/audit.md)                             | Spec/test audit; PART 8 writes ledger, then one idempotent project-health update                                   | `/triage`                                  |
| [`/triage`](commands/triage.md)                           | Findings + Linear Triage intake; ordinary → Backlog, Urgent fast lane → Todo/current                               | `/dispatch`                                |
| [`/dispatch`](commands/dispatch.md)                       | Route/groom every scoped Backlog issue; fill 5–10 total-active queue; emit confirmed cards + optional Cloud advice | `/design RES-###` or `/sdd-to-tdd RES-###` |
| [`/design`](commands/design.md)                           | Greenfield spec — hub walk, grill, one new spec file                                                               | `/sdd-to-tdd @<file>` FEATURE              |
| [`/sdd-to-tdd`](commands/sdd-to-tdd.md)                   | Plan Mode, START, then Red → Green → Refactor                                                                      | `/commit`                                  |
| [`/commit`](commands/commit.md)                           | Lint + typecheck + unit + harness-lint, then commit. Never Linear writes                                           | `/push`                                    |
| [`/push`](commands/push.md)                               | Human heads (`sdd/RES-###` or `staging` promotion). Never merges                                                   | `/ready-merge-release PR#` then you merge  |
| [`/intake`](commands/intake.md)                           | Cloud `cursor/<slug>-<4 hex>` PRs. Isolated gates. Never merges                                                    | `/ready-merge-release PR#` then you merge  |
| [`/ready-merge-release`](commands/ready-merge-release.md) | Severity-routes CodeRabbit findings; readies and re-verifies only a clean PR. Never merges                         | You merge                                  |
| [`/capture`](commands/capture.md)                         | Observation → ledger                                                                                               | `/triage`                                  |
| [`/tldr`](commands/tldr.md)                               | Recap a plan, chat, or `RES-###` (Ask Mode)                                                                        | —                                          |
| [`/reflect`](commands/reflect.md)                         | Re-check a thread’s claims against the tree                                                                        | —                                          |

Helper: [`/reset-remote-db`](commands/reset-remote-db.md).

---

## Do not put on the loop

| Skip                                                                             | Why                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| `/audit` after every ticket                                                      | TDD + `/commit` already prove the criterion |
| `/dispatch` promoting a groomed issue outside the approved `activate-daily-wave` | Portfolio metadata is not activation        |
| `/dispatch` emitting a card before Todo/current-cycle post-apply confirmation    | Failed/partial promotions are excluded      |
| `/audit` filing issues or using Linear as an acceptance bar                      | Project update is visibility only           |
| Treating a Cloud recommendation as launch authorization                          | Advice never assigns, delegates, or spawns  |
| `/intake` on a non-`cursor/` head                                                | Use `/push`                                 |
| `/push` while an OPEN `cursor/` PR exists                                        | Intake first                                |
| Agent `gh pr merge` or Linear In Progress / In Review / Done                     | You merge; automations own those states     |
| `/review` as a Linear Done gate                                                  | Mode 1 file/plan revise only                |

---

## This folder

| Path                     | What                                      |
| ------------------------ | ----------------------------------------- |
| [`commands/`](commands/) | Slash-command orchestrators               |
| [`agents/`](agents/)     | Subagents (`spec-verifier`, `tdd-red`, …) |
| [`rules/`](rules/)       | Doctrine                                  |
| [`hooks/`](hooks/)       | Mechanical guards                         |
| [`checks/`](checks/)     | Harness lints and policy tests            |

## Next reading

- [`rules/staging-accumulator.mdc`](rules/staging-accumulator.mdc)
- [`rules/linear-project-routing.mdc`](rules/linear-project-routing.mdc)
- [`rules/grilling.mdc`](rules/grilling.mdc)
- [`rules/linear-automation.mdc`](rules/linear-automation.mdc)
- [`rules/scheduled-jobs.mdc`](rules/scheduled-jobs.mdc)
- [`docs/findings/README.md`](../docs/findings/README.md)
