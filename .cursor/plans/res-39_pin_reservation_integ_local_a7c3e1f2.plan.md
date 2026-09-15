# RES-39 — Pin reservation integration tests to local Supabase

## Execution Protocol (MANDATORY — read first when executing this plan)

You are the **orchestrator**, not an implementer. When this plan is executed:

- Your **only direct writes** are: (1) the **approved spec edit** under
  `docs/specs/**` (local: after operator yes; managed Cloud: the exact path
  listed in `## Permissions Requested`), (2) the findings revision pass on
  `docs/findings/runs/<plan-slug>.md` after every phase (and, at close-out, the
  merge of its open lines into `docs/findings/<category>.md` + prune to
  `archive.md`), (3) appending Refactor close-out sections to
  `docs/verifier-reports/tdd/<plan-slug>.md` after each `tdd-refactor` phase,
  and (4) at close-out, **`## Suggested Review Order (collated)`** (Step 4D),
  **`## Traceability (final)`**, and **`## Run metrics`** (Step 4E) in the same
  tdd log. **Managed Cloud only, before execution:** also write the work-order
  to `.cursor/plans/<plan-slug>.plan.md` (repository work-order, not a
  silently accepted native Cursor Plan). After a spec or living-findings
  (`docs/findings/<category>.md`) write, `pnpm exec prettier --write` **that
  file** (never `prettier --write .`). Snapshot trees (`docs/eval`,
  `docs/verifier-reports`, `docs/findings/runs`) are prettierignored.
  Everything else is delegated.
- **Every test change** comes from a `tdd-red` Task call. **Every source change**
  from `tdd-green`. **Every cleanup / re-verify** from `tdd-refactor`. Run them
  sequentially, one **phase** at a time (not one criterion at a time), honoring
  each phase's exit condition before the next Task call.
- **Do not mark a phase done on subagent assertion alone**
  ([.cursor/rules/verification-before-completion.mdc](.cursor/rules/verification-before-completion.mdc)).
  A phase's "GREEN ✓" / "RED ✓" report is that subagent's claim; before
  advancing to the next Task call, the phase's own exit condition (the target
  test's actual pass/fail status) must be visible in the returned report — not
  assumed from a prior phase or from memory.
- **One Task call per phase.** Each todo is a single phase delegation; do not
  satisfy a bundled "drive criterion X" todo by doing Red+Green+Refactor in one
  turn, and do not treat a "same as the previous criterion" note as license to
  self-implement. If a phase lacks its own explicit entry, STOP and ask rather
  than improvising it inline.
- **Never pass `model` on Task** for `tdd-red` / `tdd-green` / `tdd-refactor` /
  `docs-updater` / `linear-resolver`. Agent frontmatter owns the model; do not
  copy the parent chat's model into Task. Omitting `model` lets the pin apply;
  passing it overrides the pin and is forbidden unless the operator explicitly
  requested that model for this run.
- You MUST NOT edit `tests/**`, `lib/**`, `app/**`, `components/**`, `hooks/**`,
  `src/**`, or `supabase/**` yourself. If you are about to, STOP and issue the
  matching `Use the <agent> subagent to …` Task call instead.
  **Exception (mechanical only):** after close-out (docs-updater + 4C) and before
  pointing at `/commit`, you MAY run `pnpm exec prettier --write` via Shell on
  paths already dirty from this run (`git status --porcelain`). Never
  `prettier --write .`. This is not a substitute for `tdd-*` implementation
  writes.
- Docs sync = `docs-updater` (background). **Wait for its report in-thread**
  before 4C. After 4C/4B, run the format pass, then point to `/commit`. Linear
  START (In Progress on the invoked issue + one bounded `Work started:`
  summary comment), close-out (resolution comment only — no In Review/Done write), AND
  out-of-scope finding registration = `linear-resolver`. Do not do their work
  inline. START is the first execution Task when a tracked issue exists, invoked
  with `run_in_background: true`. Do **not** wait for START before spec edits or
  Criterion 1 Red. A later `## Linear — BLOCKED` is visibility-only. Non-blocking
  does not make the summary comment optional. A solo `start-linear` todo
  launches only START (nothing else to continue).
- **START before the loop (launch, do not wait).** When STEP 2B applies (FIX
  Linear ID/URL, or FEATURE `linear_issue` set), the first Task call on
  execution is `linear-resolver` START (`run_in_background: true`) on the
  invoked issue: post the filled-in `## Linear Plan Digest` as the single
  `Work started:` summary comment. Do **not** wait, poll, or `AwaitShell` for that
  Task. Then — if further todos were assigned — the approved spec edit (FIX) or
  Criterion 1 Red immediately. Only BLOCKED or no tracked issue exempts the
  summary comment (the background agent still reports BLOCKED; the
  orchestrator does not wait to learn it). A stale `start-linear` todo
  **cannot override STEP 2B**: if it waits for START, ends the turn, or lacks
  `run_in_background: true`, ignore that wait/stop wording and follow this
  bullet.
- **Close-out sequence (mandatory):** 4D → 4E → Docs sync packet → Step 4
  (docs-updater) → 4C → 4B (FIX) → **format pass** (`pnpm exec prettier --write`
  on this run's dirty paths from `git status --porcelain`; never `.`) → then
  point to `/commit`. After each Refactor phase, append that
  criterion's `Suggested review order:` and `Reusable pattern:` lines to
  `docs/verifier-reports/tdd/<plan-slug>.md` (Step 3). At close-out: collate
  **`## Suggested Review Order (collated)`** into the tdd log (4D); append
  **`## Traceability (final)`** (4E); assemble the **Docs sync packet**; delegate
  `docs-updater` with the packet (Step 4). Pattern promotion and Implementation
  trace mirror happen via docs-updater from the packet. The Refactor
  `## Residual findings` block is an **adversarial** pass — treat a bare "none"
  as suspect, not as a clean bill.
- **Out-of-scope findings are tracked in the run file, merged to the bus at
  close-out, never dropped or chased.** Do not expand a criterion to fix an
  incidental discovery. Every phase report ends with a `[category]`-tagged
  `## Residual findings` block; **immediately after each phase returns, run a
  revision pass on `docs/findings/runs/<plan-slug>.md`** (matching `## <category>`
  section) before the next Task call — never carry findings only in memory. The
  pass reconciles, it doesn't blind-append: remove entries this phase resolved
  in-run, dedupe/sharpen existing ones, append only genuinely new out-of-scope
  items that no later criterion handles, and drop process notes. At close-out,
  **merge** the run file's open lines into the matching `docs/findings/<category>.md`
  (dedupe/sharpen), delegate `linear-resolver` to read the (already-curated)
  `docs/findings/*.md` (plus the plan's Out-of-Scope Findings table), file the
  findings as linked Linear issues (your confirmation gates creation — managed
  Cloud does not auto-confirm net-new finding issues; persist to the ledger and
  STOP), then
  **prune** each registered entry into `docs/findings/archive.md` with its issue
  id and **truncate/delete the run file**. If Linear is unavailable, the merged
  category files ARE the fallback backlog.
- **A skipped test is not progress** (see
  [.cursor/rules/test-execution-integrity.mdc](.cursor/rules/test-execution-integrity.mdc)).
  No phase advances on a test that did not execute — that is a BLOCKER, never a
  Red/Green/Refactor pass. Ensure local Supabase is up and seeded
  (`npx supabase start && npx supabase db reset --local`) before the loop and
  run integration phases with `pnpm test:integration` (fail-closed). For e2e phases,
  ensure the local app + seed/storage-state are ready and run
  `pnpm exec playwright test <path> --project=chromium-desktop` (or
  `pnpm test:e2e:chromium <path>`). If a phase returns `BLOCKED (infra)`, STOP
  and report the remedy.
- If you cannot delegate (Task tool unavailable in this mode), STOP and report —
  do not self-implement. Managed Cloud one-shot does not waive this STOP.
- **Managed Cloud one-shot:** after the work-order exists at
  `.cursor/plans/<plan-slug>.plan.md`, execute immediately. Do not wait for a
  second plan accept. Do not auto-confirm new Linear finding issues. Cloud
  one-shot does not waive evidence, clarification, infra, delegation,
  phase-exit, write-scope, or verification STOPs.
- If the delegation-guard hook is installed, arm it as your FIRST execution
  action (`node .cursor/hooks/tdd-guard.mjs on`) and disarm it as your LAST
  (`node .cursor/hooks/tdd-guard.mjs off`). Before each phase's Task call, set
  the active phase (`node .cursor/hooks/tdd-guard.mjs phase red|green|refactor`)
  so the guard enforces that phase's write scope on the subagent — Red confined
  to `tests/**`, Green/Refactor blocked from touching `tests/**`; clear it
  (`phase clear`) once the criterion's Refactor exits green.

## Mode Check

- Plan Mode: CLOUD-MANAGED (one-shot)
- Cloud runtime: `agent/runtime` = managed
- Work-order: `.cursor/plans/res-39_pin_reservation_integ_local_a7c3e1f2.plan.md`
- Workflow mode: FIX
- linear_issue: RES-39

## Issue & Root Cause (FIX mode only — omit for FEATURE)

- Issue: **RES-39** — Pin reservation integration tests to local Supabase. Observed: all five `tests/integration/reservations/*.integ.test.ts` suites mutate `reservations` (service-role insert/delete, `createReservation`, and in one case `blocked_dates`) with no local-host isolation pin. Expected: same fail-closed local-only pin as scheduling OH-SAVE (`assertIsolatedHoursMutationTarget` in `beforeAll` / cleanup).
- Missing constraint (root cause): `docs/specs/booking-rules.md` never requires mutating reservation integration coverage to run only against local Supabase. Scheduling §15 already encodes that rule for hours; reservation suites were left unpinned. `.env.local` (or a shell export) can point at linked remote `tilcqrudqxznnpepxjqq`; a strict run would mutate that project.
- Spec update proposed: `docs/specs/booking-rules.md` → add **RES-ISO** (item 21). FIRST execution write after START.

**Evidence (STEP 1B):**

- Linear `get_issue` RES-39 (uuid `71adb1be-3061-48bf-aef6-e558c9d5953a`): High, test-debt, M5 — Alpha Release, In Progress, relatedTo RES-23 (the REAZED-305 source). Comments: `@cursor /sdd-to-tdd` + GitHub sync only. No `Work started:` digest yet.
- Grep of `tests/integration/reservations` for `assertIsolatedHoursMutationTarget` / `hours-mutation-target`: **zero hits**. All five files call `createServiceClient()` and delete/insert reservations in `beforeAll` / `afterEach` (`atomic-booking.integ.test.ts:46-68`, `occupancy-window.integ.test.ts:23-55`, `table-fit.integ.test.ts:21-42`, `public-privileges.integ.test.ts:52-68`, `review-email-pii.integ.test.ts:29-45`).
- Sibling: `tests/integration/scheduling/replace-operating-windows.integ.test.ts:104` and `:119` call `assertIsolatedHoursMutationTarget()` at the start of `beforeAll` and `afterAll`. Helper: `lib/scheduling/hours-mutation-target.ts:28-33` (fail-closed on non-`127.0.0.1`/`localhost`/`[::1]`). Unit pin already in `tests/unit/scheduling/hours-mutation-target.test.ts`.
- `createServiceClient` (`lib/supabase/service.ts:8-21`) has no URL guard — scheduling §15 forbids putting the pin there (staff Save against the linked project is valid production). Same prohibition applies here.
- `vitest.integration.config.ts` does not load `.env.local` (guide), but a runner that exports those vars — or a future `loadEnv` — still hits the remote. The hours suite already treats that as fail-closed, not "config will save us."
- Archive: finding was filed as REAZED-317; this assignment is RES-39 (same title/body).

**Pre-mortem:** Isolation "ships" but the scan only mentions one filename — the other four still delete/insert on `tilcqrudqxznnpepxjqq`. RES-ISO MUST name the glob `tests/integration/reservations/*.integ.test.ts`, and C1 MUST iterate every file the glob matches (a sixth file must also fail until pinned). Cleanup (`afterEach` delete) is itself a mutating write; pinning only `beforeAll` still lets a failed suite's `afterEach` hit the remote (Vitest still runs cleanup).

**Inversion:** A comment containing `assertIsolatedHoursMutationTarget` must not pass. C1 MUST require (1) an import from `@/lib/scheduling/hours-mutation-target` and (2) a **call expression** as the first statement of `beforeAll` and of every `afterEach`/`afterAll` callback (`assertIsolatedHoursMutationTarget()`), not a mention in a string/comment.

Clarifications needed: none. Sibling + issue body make the rule testable. Do not invent a second helper; reuse `assertIsolatedHoursMutationTarget` (minimality). Do not put the guard in `createServiceClient`.

## Spec

- Source: extend existing `docs/specs/booking-rules.md` (hub: `docs/specs/README.md` → this file; no `docs/specs/domains/` tree). PV-9 PII suite lives under the same glob; booking-rules owns the folder pin. `post-visit-review-email.md` is not edited this run.
- Summary: Guest booking rules (party cap, RLS insert-only, occupancy/table-fit). This FIX adds the local-only isolation rule scheduling §15 already has, scoped to mutating reservation integration suites.
- Clarifications needed: none.

### Spec edit to apply (exact)

In `docs/specs/booking-rules.md`:

1. Set **Last updated** to `2026-09-09`.
2. After item 20 (**STAFF-LIST**), append item 21:

```markdown
21. **RES-ISO — Mutating reservation integration is local-only.** Mutating
    automated coverage under `tests/integration/reservations/*.integ.test.ts`
    (cleanup deletes, service-role inserts, `createReservation` writes,
    `blocked_dates` probes) MUST run only against **local** Supabase
    (`NEXT_PUBLIC_SUPABASE_URL` host `127.0.0.1`, `localhost`, or `[::1]`). It
    MUST fail closed — not skip — when the URL is the shared linked project
    `tilcqrudqxznnpepxjqq` (or any other non-local host). Use the existing
    `authEnvReady` / `RESTAURANT_INTEGRATION_STRICT` setup symbols **plus**
    `assertIsolatedHoursMutationTarget()` from
    `lib/scheduling/hours-mutation-target.ts` (same helper as scheduling.md
    §15). Call it as the **first statement** of `beforeAll` and of every
    cleanup hook that writes (`afterEach` / `afterAll`). Do not put the guard
    in `createServiceClient` (staff/admin against the linked project remains
    valid production). A new file matching that glob MUST include the same
    pin. Helper fail-closed behavior (omitted URL follows env; explicit URL
    wins; missing/empty/invalid/non-local throws) stays owned by scheduling
    §15 / `tests/unit/scheduling/hours-mutation-target.test.ts`.
```

3. In the implementation-trace table, add a row:

| RES-ISO | `assertIsolatedHoursMutationTarget()` at start of `beforeAll` and write-cleanup hooks in every `tests/integration/reservations/*.integ.test.ts`. Same helper as scheduling.md §15. | `tests/unit/reservations/reservation-integ-isolation.test.ts` |

## Acceptance Criteria → Tests

| #   | Criterion | Risk | Layer | Test file | New or existing | Test name | Assertion | Command | Depends on |
| --- | --------- | ---- | ----- | --------- | --------------- | --------- | --------- | ------- | ---------- |
| C1  | RES-ISO suite wiring | P0 | unit | `tests/unit/reservations/reservation-integ-isolation.test.ts` | new file | `reservation integ suites call assertIsolatedHoursMutationTarget before mutating writes` | Every `tests/integration/reservations/*.integ.test.ts` (glob, not a fixed five-name list) imports `assertIsolatedHoursMutationTarget` from `@/lib/scheduling/hours-mutation-target` and invokes `assertIsolatedHoursMutationTarget()` as the first statement of `beforeAll` and of every `afterEach`/`afterAll`. A comment or string mention is not enough. | `pnpm test:unit tests/unit/reservations/reservation-integ-isolation.test.ts` | none |

C1 is unit because the missing pin is a source-text contract on the integ files; the helper's fail-closed host logic is already unit-tested. Do **not** duplicate that host matrix. Do **not** require an integration run against the linked remote. No e2e. No manual-UAT.

C1 is **test-only wiring** after Red's scan is proven RED (same shape as OH-SAVE C2). Green has **no application source**. Do not put the guard in `createServiceClient`.

## Traceability Matrix

| Criterion | Spec ref | Test file::name | Source file(s) | Risk | Status |
| --------- | -------- | --------------- | -------------- | ---- | ------ |
| C1 | booking-rules.md RES-ISO | reservation-integ-isolation.test.ts::reservation integ suites call assertIsolatedHoursMutationTarget before mutating writes | none (reuse `lib/scheduling/hours-mutation-target.ts`; wire existing integ suites) | P0 | planned |

## Execution Preconditions

- Infra needed for C1: none (unit file-read / AST-or-regex pin). Integration suites are **not** this criterion's gate. Do not treat a later optional local integ smoke as C1's exit.
- If a phase later runs reservation integ files, local Supabase must be up + seeded and the command is `$env:RESTAURANT_INTEGRATION_STRICT = 'true'; pnpm test:integration <path>`. A skip is BLOCKED. C1 itself does not need that.
- Migrations: none.
- Do not add a new isolation helper. Reuse `assertIsolatedHoursMutationTarget`.

## Permissions Requested (before execution)

- Spec create/edit: `docs/specs/booking-rules.md` — add RES-ISO (item 21); bump Last updated; add implementation-trace row.
- Existing-test edit: the five current files under `tests/integration/reservations/*.integ.test.ts`:
  - `tests/integration/reservations/atomic-booking.integ.test.ts`
  - `tests/integration/reservations/occupancy-window.integ.test.ts`
  - `tests/integration/reservations/table-fit.integ.test.ts`
  - `tests/integration/reservations/public-privileges.integ.test.ts`
  - `tests/integration/reservations/review-email-pii.integ.test.ts`
  Wiring only: import + first-statement `assertIsolatedHoursMutationTarget()` in `beforeAll` and write-cleanup hooks. Do not change assertions or dates.
- Existing-test edit: **none** of `tests/unit/scheduling/hours-mutation-target.test.ts` (already owns the helper).

Managed Cloud one-shot: the initiating RES-39 task pre-authorizes **only** these paths.

## TDD Execution Loop

### Criterion C1 — RES-ISO suite wiring (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C1. Work-order: `.cursor/plans/res-39_pin_reservation_integ_local_a7c3e1f2.plan.md` (read C1 + RES-ISO). File: `tests/unit/reservations/reservation-integ-isolation.test.ts`. Name: `reservation integ suites call assertIsolatedHoursMutationTarget before mutating writes`. Discover files via the glob `tests/integration/reservations/*.integ.test.ts` (must be ≥1; fail if the directory is empty). For each file: require the named import from `@/lib/scheduling/hours-mutation-target`; require `assertIsolatedHoursMutationTarget()` as the first statement inside `beforeAll` and inside every `afterEach`/`afterAll` callback (whitespace-flexible; must be a call, not a comment). Do **not** edit the five integ files in this phase — the scan must fail on today's tree. Command: `pnpm test:unit tests/unit/reservations/reservation-integ-isolation.test.ts`. Exit: RED for missing import/call (assertion), not a harness error. Must execute, not skip.
- **Red-wire** (existing-test permission; still `tdd-red`) → After Red is RED, invoke the `tdd-red` subagent to apply the authorized integ wiring only. Work-order path + C1 RES-ISO. Add the import and the first-statement calls to every current `tests/integration/reservations/*.integ.test.ts`. Do not add a second `it`, do not change payloads/dates/assertions. Re-run the C1 unit command; it should now pass. This is the only phase allowed to edit those five files. Exit: C1 unit test GREEN (executed). If Red-wire is skipped, Green MUST NOT invent a `createServiceClient` pin.
- **Green** → Invoke the `tdd-green` subagent to make C1 pass. Expected: **no application source**. Re-run the C1 unit command. If it is RED, STOP (Red-wire was skipped) — do not add a guard to `createServiceClient` or a new helper. If it is GREEN, report no source change. Never edit tests/spec. Exit: target test GREEN (executed), typecheck clean.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C1 and re-verify. Re-run the C1 unit file and `pnpm test:unit tests/unit/scheduling/hours-mutation-target.test.ts` (helper unchanged). Exit: tests GREEN (executed) + `pnpm lint` (0 warnings) + `pnpm typecheck` + `pnpm exec prettier --check` on files this criterion touched (integ suites + new unit file; no source expected). Return adversarial `## Residual findings`, `Suggested review order:`, `Reusable pattern:`.

## Manual-UAT (deferred, not automated)

- none

## Linear Plan Digest (posted at START — the only artifact Linear ever sees)

```markdown
Work started: `/sdd-to-tdd` execution · plan `res-39_pin_reservation_integ_local_a7c3e1f2`

**Plan digest** — pre-execution intent, not a result. Authoritative record is the
owning spec plus `docs/verifier-reports/tdd/res-39_pin_reservation_integ_local_a7c3e1f2.md` at close-out.

Mode: FIX
Owning spec: `docs/specs/booking-rules.md`
Criteria: 1 automatable · 0 manual-UAT
Approval gates: spec create/edit `docs/specs/booking-rules.md` · existing-test edit `tests/integration/reservations/*.integ.test.ts`
Infra: none (unit file-scan)
Full plan: not posted to Linear (size-bounded digest) · local copy `res-39_pin_reservation_integ_local_a7c3e1f2.plan.md`

Problem: Reservation integration suites insert and delete reservations with no local-host isolation pin. Scheduling already fails closed via assertIsolatedHoursMutationTarget when NEXT_PUBLIC_SUPABASE_URL is the linked remote tilcqrudqxznnpepxjqq; reservation suites still would mutate that project.
Approach: Encode RES-ISO on booking-rules (local-only, fail-closed, first statement of beforeAll and write-cleanup hooks, reuse the hours helper, never createServiceClient). Drive one unit glob-scan through Red, authorized integ wiring, Green (no new source), Refactor.
Out-of-scope findings: marketing review-email-schema integ missing the same pin (high); POS orders-persistence integ missing the same pin (high)

| #   | Criterion                          | Risk | Layer | Test file                                      |
| --- | ---------------------------------- | ---- | ----- | ---------------------------------------------- |
| C1  | RES-ISO reservation integ local pin | P0   | unit  | reservation-integ-isolation.test.ts            |
```

## Docs Sync

Execution-start todo: `start-linear` — Invoke the `linear-resolver` subagent to start work on RES-39 (plan: res-39_pin_reservation_integ_local_a7c3e1f2), handing the executing session's plan-file path (do not inline the body; do not bake the path into this todo text) and posting this digest; Task `run_in_background: true`; do not wait for its report before spec/C1. INPUT: this plan's `## Linear Plan Digest` section.

Phase todos (one per phase; do not bundle):

- `c1-red` — Invoke the `tdd-red` subagent to write the failing test for C1
- `c1-red-wire` — Invoke the `tdd-red` subagent to apply the authorized existing-test wiring for C1
- `c1-green` — Invoke the `tdd-green` subagent to make the C1 test pass
- `c1-refactor` — Invoke the `tdd-refactor` subagent to clean up C1 and re-verify

Close-out todos:

- `4d-review-trail` — Collate **Suggested Review Order (collated)** into `docs/verifier-reports/tdd/res-39_pin_reservation_integ_local_a7c3e1f2.md`. INPUT: that log’s per-criterion Refactor sections. OUTPUT: `## Suggested Review Order (collated)`.
- `4e-traceability` — Finalize **Traceability (final)** + **Run metrics** in the same tdd log. INPUT: `docs/verifier-reports/tdd/res-39_pin_reservation_integ_local_a7c3e1f2.md`. OUTPUT: those two headings. Then `node .cursor/checks/harness-lint.mjs res-39_pin_reservation_integ_local_a7c3e1f2`.
- `4-docs-packet` — Assemble the Docs sync packet in-thread from the tdd log.
- `4-docs-updater` — Invoke the `docs-updater` subagent with that packet (`run_in_background: true`); wait for its report before 4C.
- `4c-findings` — Merge INPUT `docs/findings/runs/res-39_pin_reservation_integ_local_a7c3e1f2.md` into `docs/findings/<category>.md`, then invoke `linear-resolver` to register findings (Cloud: persist + STOP before net-new issues).
- `4b-linear` — Invoke the `linear-resolver` subagent to post the RES-39 resolution comment only (no state write).
- `4-format` — INPUT: this run’s dirty paths from `git status --porcelain`. OUTPUT: `pnpm exec prettier --write <path> …` (never `.`). Then point to `/commit`.

```markdown
## Docs sync packet

- plan_slug: res-39_pin_reservation_integ_local_a7c3e1f2
- spec: docs/specs/booking-rules.md
- mode: FIX
- linear_issue: RES-39
- criteria_shipped: [C1]
- criteria_manual_uat: none
- req_ids: [RES-ISO]
- source_paths: []
- test_paths: [tests/unit/reservations/reservation-integ-isolation.test.ts, tests/integration/reservations/atomic-booking.integ.test.ts, tests/integration/reservations/occupancy-window.integ.test.ts, tests/integration/reservations/table-fit.integ.test.ts, tests/integration/reservations/public-privileges.integ.test.ts, tests/integration/reservations/review-email-pii.integ.test.ts]
- architecture_touch: none
- uat_flows_to_stamp: none
- patterns_to_promote: none
- traceability_log: docs/verifier-reports/tdd/res-39_pin_reservation_integ_local_a7c3e1f2.md
- drift_flagged: none
- skip_reason: none
```

## Out-of-Scope Findings (the Findings Ledger — "none" if empty)

| Finding | Where (file:line/area) | Why it matters | Severity | Relation |
| ------- | ---------------------- | -------------- | -------- | -------- |
| Marketing review-email-schema integ has no local-host isolation pin | `tests/integration/marketing/review-email-schema.integ.test.ts` vs `assertIsolatedHoursMutationTarget` | Same class as RES-39: service-role writes; a remote URL would mutate `tilcqrudqxznnpepxjqq` | high | same-class sibling; stay scoped to `reservations/*` |
| POS orders-persistence integ has no local-host isolation pin | `tests/integration/pos/orders-persistence.integ.test.ts` vs `assertIsolatedHoursMutationTarget` | Same class: service-role insert/delete without the hours isolation pin | high | same-class sibling; stay scoped to `reservations/*` |

Seed these into `docs/findings/runs/res-39_pin_reservation_integ_local_a7c3e1f2.md` `## test-debt` at execution start (orchestrator findings write). Do not expand C1 to those folders.

## Linear Close-out & Findings Registration

- **START:** Invoke the `linear-resolver` subagent to start work on RES-39 (plan: res-39_pin_reservation_integ_local_a7c3e1f2), posting this plan's `## Linear Plan Digest` (bounded to `START_SUMMARY_MAX_CHARS`) as the single `Work started:` comment. Task `run_in_background: true`; do not wait before spec/C1. Issue is already In Progress (state no-op); summary is still required. Idempotent if a `Work started:` comment with this plan slug already exists.
- **Close-out:** After 4C, invoke `linear-resolver` for RES-39: post structured resolution comment only. Then `/commit` in this thread.
- **Findings registration:** Merge the run file into `docs/findings/test-debt.md`. Cloud: persist + STOP before creating net-new Linear issues. Attach-over-create may match an existing isolation/test-debt issue; do not auto-confirm rung-4 creates.

## Suggested Review Order (review trail — assembled at close-out, Step 4D)

Placeholder — collated after Refactor phases into the tdd log.

- [security] reservation integ `beforeAll`/`afterEach` isolation calls (remote mutation)
- [test-debt] glob-scan so a sixth reservation integ file cannot ship unpinned

## Retrospective (close-out, Step 4E — "none" if nothing reusable)

- Patterns for packet `patterns_to_promote`: none (pending Refactor lines)
- Traceability finalized in tdd log `## Traceability (final)`: pending
- Run metrics stamped in tdd log `## Run metrics`: pending
- `node .cursor/checks/harness-lint.mjs res-39_pin_reservation_integ_local_a7c3e1f2`: pending

## First Execution Action

- **Managed Cloud one-shot:** work-order is this file. Do not wait for a second accept. Arm `tdd-guard`. Launch START (Task `run_in_background: true`; do not wait). Apply the spec edit listed in `## Permissions Requested`. Seed the run-file findings. Then delegate C1 Red. Bound by every non-waived STOP.
