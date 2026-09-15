# RES-48 — Occupancy cover SELECT must lock before counting

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
  **`## Traceability (final)`** (Step 4E); assemble the **Docs sync packet**; delegate
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
- Work-order: `.cursor/plans/res-48_occupancy_cover_lock_7d2e91a4.plan.md`
- Workflow mode: FIX
- linear_issue: RES-48

## Issue & Root Cause (FIX mode only — omit for FEATURE)

- Issue: **RES-48** — Occupancy cover SELECT is unlocked in `validate_reservation_availability`. Observed: occupying cover `SUM(r.party_size)` runs before `pg_advisory_xact_lock(305, epoch-days)`. Expected: concurrent overlapping-window occupying inserts must not exceed floor cover; the cover read must be serialized before it counts.
- Missing constraint (root cause): BW-9 requires the trigger to enforce occupancy cover on INSERT/UPDATE but never requires that cover SELECT to run **under the date lock**. BW-12 placed the existing advisory lock **after** cover-count (last compatible unit). `atomic-booking.integ.test.ts` only races the same slot. Distinct from RES-23 / REAZED-305 (table-fit).
- Spec update proposed: `docs/specs/booking-rules.md` → add **BW-15** (serialized cover) + one sentence on BW-9 pointing at it; add the BW-15 implementation-trace row; fix the BW-12 trace so it no longer says the lock is after cover-count. FIRST execution write after START.

**Evidence (STEP 1B):**

- Linear RES-48 (security, Medium, M5): concurrent full-floor `19:00` INSERT and `20:30` INSERT can both pass cover because neither occupancy-cover row is visible or locked. Spun off from REAZED-309 / RES-31 close-out. Related: RES-23 (table-fit), RES-31 (occupancy window).
- Sibling that works: BW-12 already serializes table-fit with `PERFORM pg_advisory_xact_lock(305, (NEW.date::DATE - DATE '1970-01-01')::INT)` in `supabase/migrations/00000000000000_baseline.sql` (lock at the table-fit block, **after** `INTO v_occupying`). Same body in `20260818162000_operating_hour_segments.sql`, `20260827180000_occupancy_duration_buffer.sql`, `20260828121224_table_fit_availability.sql`.
- Cover SELECT (baseline ~295–302) is unlocked: `SUM(r.party_size)` with one-way `NEW.time >= r.time` and elapsed `TIME < v_window`. No `FOR UPDATE`. Empty-date concurrent inserts have no row to lock anyway — advisory lock on the date is the correct primitive (SELECT FOR UPDATE cannot close a phantom insert).
- `tests/integration/reservations/atomic-booking.integ.test.ts` races two party-of-8 at the **same** `13:00` slot (last 8-top). `occupancy-window.integ.test.ts` is **sequential** 19:00 full-floor then 20:30 / 20:45.
- After REAZED-305 the date lock + two-way table-fit may already reject some overlapping racers **after** an unlocked cover pass. That does not satisfy BW-9: cover itself is still racy. Inversion: a test that only greps `pg_advisory_xact_lock` anywhere in the function can pass while cover still runs first.

**Single hypothesis (confirmed against SQL):** Cover-count is not in the critical section. The spec must require the existing date lock to be acquired **before** `INTO v_occupying`. Moving that `PERFORM` (keep classid 305 / date objid) is the fix. Do not invent a second lock key. Do not expand this run to two-interval cover (archived stale → wont-file).

**Pre-mortem:** Two guests confirm leftover `19:00` and overlapping `20:30` in the same instant. Both cover reads see the same occupying set and both pass. Floor cover is exceeded unless a later check saves it. Had BW-15 existed, the second writer would wait, re-read cover, and raise P0001.

**Inversion / red-team:** `toContain("pg_advisory_xact_lock")` passes today. C1 must assert `indexOf("PERFORM pg_advisory_xact_lock") < indexOf("INTO v_occupying")` on each last-writer body, and that those bodies are byte-identical, including a new dated forward.

## Spec

- Source: extend existing `docs/specs/booking-rules.md` (hub: `docs/specs/README.md` → this file; no `docs/specs/domains/` tree).
- Summary: Guest confirm path enforces occupancy cover (BW-9) and table-fit (BW-12) in `validate_reservation_availability`. This FIX requires the date-scoped advisory lock to wrap cover-count, not only table-fit, so overlapping-window races cannot exceed `sum(tables.seats)`.
- Clarifications needed: none. One-way vs two-interval cover was already triaged stale; not this run. Last-writer identity stays the BW-12 four-file set plus one new dated forward (remotes already recorded `20260828121224`).

### Spec edit to apply (exact)

In `docs/specs/booking-rules.md`:

1. After BW-9's sentence that begins `validate_reservation_availability` trigger enforces it on INSERT/UPDATE, add: `Cover-count on the confirm path MUST be serialized per BW-15.`
2. After criterion 21 (RES-ISO), append criterion 22 (do **not** renumber BW-13–RES-ISO):

22. **BW-15 — Occupancy cover is serialized.** Occupying INSERT/UPDATE (`confirmed` / `seated`) MUST acquire the date-scoped advisory lock `pg_advisory_xact_lock(305, (date - 1970-01-01)::int)` (classid 305 = REAZED-305; objid = days since epoch, **not** slot) **before** the occupancy cover SELECT that sums overlapping `party_size`. Concurrent occupying inserts whose BW-9 windows overlap MUST NOT together exceed `sum(tables.seats)`. The rejected writer MUST raise P0001 `Booking denied: This time is fully booked.` (same user-facing string as BW-9 / BW-12). Last-writer SQL (lock, then cover-count, then table-fit) MUST be byte-identical in `00000000000000_baseline.sql`, `20260818162000_operating_hour_segments.sql`, `20260827180000_occupancy_duration_buffer.sql`, `20260828121224_table_fit_availability.sql`, and a new dated forward for remotes that already recorded table-fit. `SELECT FOR UPDATE` of existing occupancy rows is not sufficient (empty-date phantom insert).

3. Implementation trace: add a BW-15 row (last-writer five-file set + C1/C2 tests). In the BW-12 shipped cell, replace “table-fit after cover-count + `pg_advisory_xact_lock`” with “date lock then cover-count then table-fit (BW-15); lock still classid 305 / epoch-days”.

4. Leave **Last updated:** `2026-09-09` (already current).

## Acceptance Criteria → Tests

| #   | Criterion | Risk | Layer | Test file | New or existing | Test name | Assertion | Command | Depends on |
| --- | --------- | ---- | ----- | --------- | --------------- | --------- | --------- | ------- | ---------- |
| C1  | BW-15 lock before cover SELECT (last-writer SQL) | P0 | unit | `tests/unit/reservations/occupancy-cover-lock.test.ts` | new file | `acquires the date advisory lock before the occupancy cover SELECT` | For each last-writer file (baseline + three existing dated + newest `*_occupancy_cover_lock.sql` with timestamp `> 20260828121224`), extract `validate_reservation_availability` body; `indexOf("PERFORM pg_advisory_xact_lock")` ≥ 0 and **strictly less than** `indexOf("INTO v_occupying")`; extracted bodies are byte-identical. A mere `toContain("pg_advisory_xact_lock")` is not enough. | `pnpm test:unit tests/unit/reservations/occupancy-cover-lock.test.ts` | none |
| C2  | BW-15 concurrent overlapping windows cannot exceed floor cover | P0 | integration | `tests/integration/reservations/occupancy-cover-lock.integ.test.ts` | new file | `serializes a leftover 19:00 insert against a concurrent overlapping 20:30 insert so occupying covers stay at or under floor seats` | Isolated date (not `2027-03-17` / `2027-06-16` / other reservation integ dates). Seed unlabeled `confirmed` 19:00 holds totaling `capacity - 2`. Two-arrival `getOperatingWindowForDate` gate (copy atomic-booking). `Promise.all` `createReservation` party 2 at 19:00 and party 2 at 20:30. Exactly one success; loser matches `/fully booked/i`; occupying `confirmed`/`seated` `party_size` sum on that date `<= capacity`. Zero-arg `assertIsolatedHoursMutationTarget()` as first statement of `beforeAll` and write-cleanup hooks. | `$env:RESTAURANT_INTEGRATION_STRICT = 'true'; pnpm test:integration tests/integration/reservations/occupancy-cover-lock.integ.test.ts` | C1 optional (Green of either may ship the lock move) |

C1 is unit because last-writer identity is decidable from migration text (sibling: `tests/unit/branding/schema.test.ts`). C2 is integration because only live Postgres + concurrent `createReservation` can prove the overlapping-window race; unit cannot. Do **not** modify `atomic-booking.integ.test.ts` or `occupancy-window.integ.test.ts` (new files only).

**C2 Red withdrawal:** REAZED-305 table-fit after the date lock may already reject the second racer. If C2 Red's new test is GREEN on current SQL (exactly one success), that is **not** Red. tdd-red must not keep a passing test. Return `already-green-outcome`. Orchestrator withdraws C2 Green/Refactor, leaves no C2 test file, and ships C1 only. Do not weaken C2 to a vacuous always-green.

## Traceability Matrix

| Criterion | Spec ref | Test file::name | Source file(s) | Risk | Status |
| --------- | -------- | --------------- | -------------- | ---- | ------ |
| C1 | booking-rules BW-15 | occupancy-cover-lock.test.ts::acquires the date advisory lock before the occupancy cover SELECT | last-writer `validate_reservation_availability` copies + new dated forward | P0 | planned |
| C2 | booking-rules BW-15 | occupancy-cover-lock.integ.test.ts::serializes a leftover 19:00 insert against a concurrent overlapping 20:30 insert so occupying covers stay at or under floor seats | same trigger (live) | P0 | planned |

## Execution Preconditions

- Infra needed for C2: local Supabase up + seeded (`npx supabase start && npx supabase db reset --local`); integration phases run with `pnpm test:integration` (fail-closed). C1: none (unit).
- If Supabase cannot be brought up, C2 STOPS (`BLOCKED (infra)`). A skipped suite is never Red/Green. C1 may still complete.
- Bring Supabase up **before** C2 Red (orchestrator Shell; not a source write).
- Migrations: Green moves `PERFORM pg_advisory_xact_lock` to immediately before the cover `SUM` / `INTO v_occupying` in all four existing last-writer files **and** adds a new dated forward (`supabase migration new` or equivalent `YYYYMMDDHHMMSS_occupancy_cover_lock.sql`) because remotes already recorded `20260828121224`. Fold + forward per `.cursor/rules/supabase-migrations.mdc` and BW-15 last-writer identity. After a Green that edits SQL, `npx supabase db reset --local` must succeed before C2 can prove live behavior.
- Do not add a second advisory classid. Do not change the one-way cover predicate in this run.

## Permissions Requested (before execution)

- Spec create/edit: `docs/specs/booking-rules.md` — add BW-15; BW-9 cross-ref; BW-12/BW-15 implementation-trace edits as enumerated above.
- Existing-test edit: none (new test files only).

Managed Cloud one-shot: the initiating RES-48 task pre-authorizes **only** this spec path.

## TDD Execution Loop

### Criterion C1 — BW-15 lock before cover SELECT (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C1. Work-order: `.cursor/plans/res-48_occupancy_cover_lock_7d2e91a4.plan.md` (read C1 + BW-15). File: `tests/unit/reservations/occupancy-cover-lock.test.ts`. Name: `acquires the date advisory lock before the occupancy cover SELECT`. Discover last-writer paths as listed; require a dated `*_occupancy_cover_lock.sql` whose leading timestamp is `> 20260828121224`. Extract the function body from `CREATE OR REPLACE FUNCTION validate_reservation_availability()` through the matching `$$;`. Assert lock index `<` cover `INTO v_occupying` index on every body; assert bodies equal. Command: `pnpm test:unit tests/unit/reservations/occupancy-cover-lock.test.ts`. Exit: RED because lock currently follows cover and/or the new dated file is missing. Must execute, not skip.
- **Green** → Invoke the `tdd-green` subagent to make C1 pass. Minimal: move `PERFORM pg_advisory_xact_lock(305, (NEW.date::DATE - DATE '1970-01-01')::INT)` to immediately before the occupying cover SELECT in all four existing function copies; add the new dated last-writer file with the identical body (consult supabase skill; `supabase migration new occupancy_cover_lock` if creating the file). Keep SECURITY DEFINER / `search_path`. Do not change cover predicate, table-fit, or classid. Exit: target test GREEN (executed), typecheck clean. Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C1 and re-verify. Exit: target test GREEN (executed) + `pnpm lint` (0 warnings) + `pnpm typecheck` + `pnpm exec prettier --check` on touched source. Return adversarial `## Residual findings`, `Suggested review order:`, `Reusable pattern:`.

### Criterion C2 — BW-15 overlapping-window cover race (layer: integration)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C2. Work-order path + C2/BW-15 only. File: `tests/integration/reservations/occupancy-cover-lock.integ.test.ts`. Name: `serializes a leftover 19:00 insert against a concurrent overlapping 20:30 insert so occupying covers stay at or under floor seats`. Reuse atomic-booking's mock/`next/cache`/`createReservation`/two-arrival hours gate. New `TEST_DATE` (suggest `2027-07-14`, Wednesday). Seed `capacity - 2` at 19:00 via service-role (unlabeled confirmed; party sizes from table seats like occupancy-window). Race party 2 at 19:00 vs party 2 at 20:30. RES-ISO zero-arg pin. Command: `$env:RESTAURANT_INTEGRATION_STRICT = 'true'; pnpm test:integration tests/integration/reservations/occupancy-cover-lock.integ.test.ts`. Exit: RED if both succeed (unlocked cover). If exactly one already succeeds on current SQL, **do not keep the passing test** — return `already-green-outcome` and write nothing (or delete the file). Must execute, not skip.
- **Green** → Invoke the `tdd-green` subagent to make C2 pass. Minimal: if C1 Green already moved the lock and reset the DB, only re-reset if needed. If C1 was not yet green, apply the same lock-before-cover last-writer change. Exit: target test GREEN (executed). Never edit tests/spec. Skip this phase if C2 was withdrawn.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C2 and re-verify (re-run C2 integ + C1 unit + occupancy-window + atomic-booking). Exit: GREEN (executed) + lint + typecheck + prettier --check on touched source. Skip if C2 was withdrawn.

## Manual-UAT (deferred, not automated)

none

## Linear Plan Digest (posted at START — the only artifact Linear ever sees)

```markdown
Work started: `/sdd-to-tdd` execution · plan `res-48_occupancy_cover_lock_7d2e91a4`

**Plan digest** — pre-execution intent, not a result. Authoritative record is the
owning spec plus `docs/verifier-reports/tdd/res-48_occupancy_cover_lock_7d2e91a4.md` at close-out.

Mode: FIX
Owning spec: `docs/specs/booking-rules.md`
Criteria: 2 automatable · 0 manual-UAT
Approval gates: spec create/edit `docs/specs/booking-rules.md`
Infra: C1 unit; C2 local Supabase (fail-closed integration)
Full plan: not posted to Linear (size-bounded digest) · local copy `res-48_occupancy_cover_lock_7d2e91a4.plan.md`

Problem: Occupying cover-count in validate_reservation_availability runs before the date advisory lock, so concurrent overlapping-window inserts can both pass the cover read. The same-slot atomic-booking test does not cover a leftover 19:00 vs 20:30 race. Table-fit after the lock is a different rule (BW-12) and is not a substitute for serialized BW-9 cover.
Approach: Encode BW-15 — acquire pg_advisory_xact_lock(305, epoch-days) before the occupancy cover SELECT; keep last-writer function bodies identical across baseline, the three existing dated copies, and a new dated forward. Drive C1 (SQL order pin) then C2 (overlapping-window race). Do not change the cover predicate or add a second lock key.
Out-of-scope findings: none

| #   | Criterion                                      | Risk | Layer       | Test file                          |
| --- | ---------------------------------------------- | ---- | ----------- | ---------------------------------- |
| C1  | Lock before occupancy cover SELECT             | P0   | unit        | occupancy-cover-lock.test.ts       |
| C2  | Concurrent 19:00 leftover vs 20:30 stays under | P0   | integration | occupancy-cover-lock.integ.test.ts |
```

## Docs Sync

Execution-start todo: `start-linear` — Invoke the `linear-resolver` subagent to start work on RES-48 (plan: res-48_occupancy_cover_lock_7d2e91a4), handing the executing session's plan-file path (do not inline the body; do not bake the path into this todo text) and posting this digest; Task `run_in_background: true`; do not wait for its report before spec/C1. INPUT: this plan's `## Linear Plan Digest` section.

Phase todos (one per phase; do not bundle):

- `c1-red` — Invoke the `tdd-red` subagent to write the failing test for C1
- `c1-green` — Invoke the `tdd-green` subagent to make the C1 test pass
- `c1-refactor` — Invoke the `tdd-refactor` subagent to clean up C1 and re-verify
- `c2-red` — Invoke the `tdd-red` subagent to write the failing test for C2
- `c2-green` — Invoke the `tdd-green` subagent to make the C2 test pass
- `c2-refactor` — Invoke the `tdd-refactor` subagent to clean up C2 and re-verify

Close-out todos:

- `4d-review-trail` — Collate **Suggested Review Order (collated)** into `docs/verifier-reports/tdd/res-48_occupancy_cover_lock_7d2e91a4.md`. INPUT: that log’s per-criterion Refactor sections. OUTPUT: `## Suggested Review Order (collated)`.
- `4e-traceability` — Finalize **Traceability (final)** + **Run metrics** in the same tdd log. INPUT: `docs/verifier-reports/tdd/res-48_occupancy_cover_lock_7d2e91a4.md`. OUTPUT: those two headings. Then `node .cursor/checks/harness-lint.mjs res-48_occupancy_cover_lock_7d2e91a4`.
- `4-docs-packet` — Assemble the Docs sync packet in-thread from the tdd log.
- `4-docs-updater` — Invoke the `docs-updater` subagent with that packet (`run_in_background: true`); wait for its report before 4C.
- `4c-findings` — Merge INPUT `docs/findings/runs/res-48_occupancy_cover_lock_7d2e91a4.md` into `docs/findings/<category>.md`, then invoke `linear-resolver` to register findings (Cloud: persist + STOP before net-new issues).
- `4b-linear` — Invoke the `linear-resolver` subagent to post the RES-48 resolution comment only (no state write).
- `4-format` — INPUT: this run’s dirty paths from `git status --porcelain`. OUTPUT: `pnpm exec prettier --write <path> …` (never `.`). Then point to `/commit`.

```markdown
## Docs sync packet

- plan_slug: res-48_occupancy_cover_lock_7d2e91a4
- spec: docs/specs/booking-rules.md
- mode: FIX
- linear_issue: RES-48
- criteria_shipped: [C1, C2]
- criteria_manual_uat: none
- req_ids: [BW-15]
- source_paths: [supabase/migrations/00000000000000_baseline.sql, supabase/migrations/20260818162000_operating_hour_segments.sql, supabase/migrations/20260827180000_occupancy_duration_buffer.sql, supabase/migrations/20260828121224_table_fit_availability.sql]
- test_paths: [tests/unit/reservations/occupancy-cover-lock.test.ts, tests/integration/reservations/occupancy-cover-lock.integ.test.ts]
- architecture_touch: [Reservation-Flow]
- uat_flows_to_stamp: none
- patterns_to_promote: none
- traceability_log: docs/verifier-reports/tdd/res-48_occupancy_cover_lock_7d2e91a4.md
- drift_flagged: none
- skip_reason: none
```

## Out-of-Scope Findings (the Findings Ledger — "none" if empty)

| Finding | Where (file:line/area) | Why it matters | Severity | Relation |
| ------- | ---------------------- | -------------- | -------- | -------- |

none — one-way cover vs two-interval overlap, date-level lock serializing non-overlapping slots, and missing `(date, status)` index were already archived stale from the REAZED-309/305 runs. Do not re-file. Table-fit last-unit (RES-23) stays distinct.

## Linear Close-out & Findings Registration

- **START:** Invoke the `linear-resolver` subagent to start work on RES-48 (plan: res-48_occupancy_cover_lock_7d2e91a4), posting this plan's `## Linear Plan Digest` (bounded to `START_SUMMARY_MAX_CHARS`) as the single `Work started:` comment. Task `run_in_background: true`; do not wait before spec/C1. Already In Progress is a state no-op; the summary still posts. `## Linear — BLOCKED` is visibility-only.
- **Close-out:** After 4C, invoke `linear-resolver` for RES-48: post structured resolution comment only. Then `/commit` in this thread.
- **Findings registration:** Skip if run file + category files + this table stay empty of **new** open lines from this run.

## Suggested Review Order (review trail — assembled at close-out, Step 4D)

Placeholder — collated after Refactor phases into the tdd log.

- [security] lock-before-cover in `validate_reservation_availability`
- [schema] last-writer identity + dated forward
- [booking] overlapping-window race vs same-slot atomic-booking

## Retrospective (close-out, Step 4E — "none" if nothing reusable)

- Patterns for packet `patterns_to_promote`: none yet
- Traceability finalized in tdd log `## Traceability (final)`: n/a (pending)
- Run metrics stamped in tdd log `## Run metrics`: n/a (pending)
- `node .cursor/checks/harness-lint.mjs res-48_occupancy_cover_lock_7d2e91a4`: n/a (pending)

## First Execution Action

- **Managed Cloud one-shot:** work-order is `.cursor/plans/res-48_occupancy_cover_lock_7d2e91a4.plan.md`. Do not wait for a second accept. Launch START (`linear-resolver` on RES-48, `run_in_background: true`; do not wait), apply the spec edit listed in `## Permissions Requested`, then delegate Criterion 1 Red.
