# RES-45 — Review-email persistence schema and scheduler

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
- Work-order: `.cursor/plans/res-45_review_email_schema_cron_7f3a91c2.plan.md`
- Workflow mode: FIX
- linear_issue: RES-45

## Issue & Root Cause (FIX mode only — omit for FEATURE)

- Issue: **RES-45** — Review-email persistence schema and scheduler are missing. Observed: `saveReviewEmailSettings` upserts `review_email_*`, `transitionReservationStatus` writes `completed_at` and inserts `review_email_sends`, and `GET /api/cron/review-email` exists — but baseline DDL has none of those objects, the route inlines an always-throwing mailer, and there is no `vercel.json` cron. Expected: a real complete / settings save persists, and production invokes the send job on a timer.
- Missing constraint (root cause): PV-2/PV-4/PV-5/PV-6 name persist targets but never require those objects in `00000000000000_baseline.sql`. PV-9 names the cron GET but never requires a Vercel schedule or a non-inline mailer factory. The FEATURE run (`post-visit_review_tdd_ac1962e1`) shipped mocked writes and deferred DDL/timer as ledger members (archived → REAZED-325 umbrella; this assignment is RES-45).
- Spec update proposed: `docs/specs/post-visit-review-email.md` → add **PV-11** (settings columns), **PV-12** (`review_email_sends` + service-role-only RLS), **PV-13** (`reservations.completed_at`), **PV-14** (cron mailer factory, not inline throw), **PV-15** (hourly `vercel.json` cron). Live inbox delivery stays the existing manual-UAT (BW-14 / implementation trace). FIRST execution write after START.

**Evidence (STEP 1B):**

- `supabase/migrations/00000000000000_baseline.sql` `reservations` (lines 86–101) has `email` but no `completed_at`. `restaurant_settings` (lines 700–721) has branding/occupancy columns only — no `review_email_*`. Grep of `supabase/migrations` for `review_email|completed_at` is empty.
- `app/actions/marketing.ts:26-31` upserts the four `review_email_*` keys. `app/actions/reservations.ts:300` sets `completed_at`; `:314-315` inserts `{ reservation_id }` into `review_email_sends`.
- `app/api/cron/review-email/route.ts:11-16` passes an inline `send()` that always throws `Mail provider is not configured.` No `vercel.json` exists in the repo.
- Sibling: `lib/marketing/booking-confirmation.ts` already hoists `unconfiguredMailer` as a named default (BW-14); review-email cron inlined the same throw instead of a factory. `orders` baseline comment (REAZED-312) is the sibling pattern for “app already writes this; fold into baseline.”
- Linear MCP `needsAuth` in this Cloud VM (desktop-only auth). Issue body from the assignment payload is the evidence source. START may return `## Linear — BLOCKED` (visibility only).

**Pre-mortem:** Feature “ships,” staff enable review email and complete a reservation. Settings upsert and/or status UPDATE fail (unknown column / missing table) — occupancy/FSM write is P0. If DDL is added without RLS on `review_email_sends`, anon can insert/claim rows and suppress or spoof sends. If only DDL lands, due rows still never send (no timer) and an authorized cron GET 500s on the first due row (inline throw).

**Inversion:** A SQL-comment grep can pass while columns are absent — C1–C3 MUST execute live INSERT/SELECT/UPDATE against local Postgres. A `vercel.json` that exists with the wrong `path` can pass a file-exists check — C5 MUST assert `path` + hourly `schedule`. A factory import that is unused can pass a source-read — C4 MUST assert authorized GET passes the factory’s mailer into `processDueReviewEmails`.

## Spec

- Source: extend existing `docs/specs/post-visit-review-email.md` (hub: `docs/specs/README.md` → this file; no `docs/specs/domains/` tree).
- Summary: Staff configure post-visit thank-you + Maps review email. Transition to `completed` queues one send after `delay_hours` on the `completed_at` clock. Fail-closed gates (PV-3). At most one success (PV-6 CAS). Cron GET is Bearer `CRON_SECRET` (PV-9). This FIX adds the persistence schema and production timer the app already assumes.
- Clarifications needed: none. Mailer-provider / From+subject remain the existing manual-UAT (no mail SDK in `package.json`; BW-14 same stub class). Hourly cron is the testable default because PV-5 delay is integer hours. Form round-trip loader is already on `docs/findings/product-gaps.md` — not this run.

### Spec edit to apply (exact)

After PV-10, append:

11. **PV-11 — Settings persist columns** — Baseline DDL MUST include on `restaurant_settings`: `review_email_enabled` BOOLEAN NOT NULL DEFAULT false; `review_email_copy` TEXT; `review_email_maps_url` TEXT; `review_email_delay_hours` INT NOT NULL DEFAULT 24. Both the `CREATE TABLE` definition and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` MUST expose them (same idempotent pattern as `slot_interval_minutes`). A service-role upsert of those four keys on `id = 1` MUST persist and read back. Public SELECT of `restaurant_settings` MAY include these columns (marketing copy, not guest PII).

12. **PV-12 — Send-queue table** — Baseline MUST create `review_email_sends` with `reservation_id UUID PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE` and `sent_at TIMESTAMPTZ` nullable default null. RLS enabled. Anon and authenticated MUST NOT SELECT/INSERT/UPDATE/DELETE (no public policies; no GRANT to anon/authenticated). `service_role` MUST INSERT `{ reservation_id }` and UPDATE `sent_at`. This is the PV-6 claim row.

13. **PV-13 — completed_at clock column** — Baseline MUST include nullable `reservations.completed_at TIMESTAMPTZ` on `CREATE TABLE` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (same pattern as `reservations.email`). A service-role UPDATE that sets `completed_at` MUST persist. This is the PV-5 clock; `updated_at` MUST NOT be added as a substitute.

14. **PV-14 — Cron mailer factory** — `GET /api/cron/review-email` MUST obtain `{ send }` from a `server-only` `createReviewEmailMailer()` (own module, not inlined in the route). The route MUST NOT contain `throw new Error("Mail provider is not configured.")`. When no provider credentials are configured, the factory’s `send` MAY throw that same fail-closed error (BW-14 class). Live provider delivery remains manual-UAT.

15. **PV-15 — Scheduled invocation** — Production MUST invoke `GET /api/cron/review-email` on a schedule. `vercel.json` MUST contain a `crons` entry whose `path` is `/api/cron/review-email` and whose `schedule` is hourly (`0 * * * *`). Delay `0` sends on the next hourly tick.

Also: set **Last updated** to `2026-09-09`. Replace the implementation-trace sentence that begins “Schema still missing from baseline…” with: “PV-11–PV-15 require baseline `review_email_*` / `review_email_sends` / `reservations.completed_at` and a `vercel.json` hourly cron; this FIX owns those. Live provider delivery stays manual-UAT.”

## Acceptance Criteria → Tests

| #   | Criterion | Risk | Layer | Test file | New or existing | Test name | Assertion | Command | Depends on |
| --- | --------- | ---- | ----- | --------- | --------------- | --------- | --------- | ------- | ---------- |
| C1  | PV-11 settings columns persist | P0 | integration | `tests/integration/marketing/review-email-schema.integ.test.ts` | new file | `service-role upsert of review_email settings columns persists and reads back` | After service-role upsert of the four keys on `id=1`, `select` returns the written values (error null). Restore prior row in `afterEach`. | `$env:RESTAURANT_INTEGRATION_STRICT = 'true'; pnpm test:integration tests/integration/marketing/review-email-schema.integ.test.ts` | none |
| C2  | PV-12 send-queue table + RLS | P0 | integration | `tests/integration/marketing/review-email-schema.integ.test.ts` | add test (same new file) | `review_email_sends accepts a reservation_id insert and denies anon writes` | Service-role insert `{ reservation_id }` succeeds; `sent_at` is null; anon `select`/`insert` is empty + permission error (42501/PGRST301). Distinct test date from PII suite. | same fail-closed integration command | C1 optional; needs a reservations row (existing table) |
| C3  | PV-13 completed_at column | P0 | integration | `tests/integration/marketing/review-email-schema.integ.test.ts` | add test | `reservations.completed_at persists a timestamptz on service-role update` | Insert reservation; update `completed_at`; select matches. Error must not be missing-column. | same fail-closed integration command | none |
| C4  | PV-14 cron mailer factory | P1 | unit | `tests/unit/marketing/review-email-cron-mailer.test.ts` | new file | `authorized cron GET passes createReviewEmailMailer result into processDue` | Mock factory returns `{ send }`; authorized GET calls `processDueReviewEmails` with that mailer; `route.ts` source has no inline unconfigured throw. | `pnpm test:unit tests/unit/marketing/review-email-cron-mailer.test.ts` | none |
| C5  | PV-15 hourly vercel cron | P1 | unit | `tests/unit/marketing/review-email-cron-schedule.test.ts` | new file | `vercel.json schedules hourly GET /api/cron/review-email` | Parsed `vercel.json` `crons` contains `{ path: "/api/cron/review-email", schedule: "0 * * * *" }`. | `pnpm test:unit tests/unit/marketing/review-email-cron-schedule.test.ts` | none |

C1–C3 are integration because only live Postgres after `db reset` can prove DDL. A SQL-string unit test cannot. C4–C5 are unit (route wiring + config file). No e2e: no multi-page UX. Live inbox = existing manual-UAT, not this loop.

Do **not** modify `tests/unit/marketing/review-email-job-auth.test.ts` (C9 unauth pin stays). Do **not** modify the PII integ suite.

## Traceability Matrix

| Criterion | Spec ref | Test file::name | Source file(s) | Risk | Status |
| --------- | -------- | --------------- | -------------- | ---- | ------ |
| C1 | PV-11 | review-email-schema.integ.test.ts::service-role upsert of review_email settings columns persists and reads back | supabase/migrations/00000000000000_baseline.sql | P0 | planned |
| C2 | PV-12 | review-email-schema.integ.test.ts::review_email_sends accepts a reservation_id insert and denies anon writes | supabase/migrations/00000000000000_baseline.sql | P0 | planned |
| C3 | PV-13 | review-email-schema.integ.test.ts::reservations.completed_at persists a timestamptz on service-role update | supabase/migrations/00000000000000_baseline.sql | P0 | planned |
| C4 | PV-14 | review-email-cron-mailer.test.ts::authorized cron GET passes createReviewEmailMailer result into processDue | app/api/cron/review-email/route.ts, lib/marketing/review-email-mailer.ts | P1 | planned |
| C5 | PV-15 | review-email-cron-schedule.test.ts::vercel.json schedules hourly GET /api/cron/review-email | vercel.json | P1 | planned |

## Execution Preconditions

- Infra needed for C1–C3: local Supabase up + seeded (`npx supabase start && npx supabase db reset --local`); integration phases run with `pnpm test:integration` (fail-closed). C4–C5: none (unit/mocked).
- If Supabase cannot be brought up, C1–C3 STOP (`BLOCKED (infra)`). A skipped suite is never Red/Green.
- Bring Supabase up **before** C1 Red (orchestrator Shell; not a source write).
- Migrations: Green folds DDL into `00000000000000_baseline.sql` (`.cursor/rules/supabase-migrations.mdc`). After C1–C3 Green, `npx supabase db reset --local` must succeed (Green/Refactor verify).
- `vercel.json` is the PV-15 production timer — Green may create it (config required by the AC). Do not add a mail SDK.

## Permissions Requested (before execution)

- Spec create/edit: `docs/specs/post-visit-review-email.md` — add PV-11–PV-15; bump Last updated; replace the “Schema still missing…” implementation-trace sentence so it does not contradict the new ACs.
- Existing-test edit: none (all new tests / new files).

Managed Cloud one-shot: the initiating RES-45 task pre-authorizes **only** this spec path.

## TDD Execution Loop

### Criterion C1 — PV-11 settings persist columns (layer: integration)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C1. Work-order: `.cursor/plans/res-45_review_email_schema_cron_7f3a91c2.plan.md` (read C1 + PV-11). File: `tests/integration/marketing/review-email-schema.integ.test.ts`. Name: `service-role upsert of review_email settings columns persists and reads back`. Reuse `authEnvReady`, `createServiceClient`, `isPermissionError` pattern from `tests/integration/reservations/review-email-pii.integ.test.ts`. Use a far-future isolated date if any reservation is created; restore `restaurant_settings` id=1 in `afterEach`. Command: `$env:RESTAURANT_INTEGRATION_STRICT = 'true'; pnpm test:integration tests/integration/marketing/review-email-schema.integ.test.ts`. Exit: RED for missing-column / schema-cache error (not harness). Must execute, not skip.
- **Green** → Invoke the `tdd-green` subagent to make C1 pass. Minimal: fold the four columns into `restaurant_settings` CREATE TABLE **and** `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `00000000000000_baseline.sql` (consult supabase + supabase-postgres-best-practices skills). Defaults: enabled false, delay 24. Do not add `review_email_sends` or `completed_at` yet. Reset local DB so PostgREST sees the columns. Exit: target test GREEN (executed), typecheck clean, no regressions. Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C1 and re-verify. Exit: target test GREEN (executed) + `pnpm lint` (0 warnings) + `pnpm typecheck` + `pnpm exec prettier --check` on touched source. Return adversarial `## Residual findings`, `Suggested review order:`, `Reusable pattern:`.

### Criterion C2 — PV-12 send-queue table + RLS (layer: integration)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C2. Work-order path + C2/PV-12 only. Same integ file. Name: `review_email_sends accepts a reservation_id insert and denies anon writes`. Insert a reservations row (service-role), then insert `{ reservation_id }`; assert `sent_at` null; anon select/insert denied (reuse PII `isPermissionError`). Distinct `TEST_DATE` from `2027-08-18` (PII) and occupancy dates. Command: same fail-closed integration command. Exit: RED because relation does not exist. Must execute.
- **Green** → Invoke the `tdd-green` subagent to make C2 pass. Minimal: `CREATE TABLE IF NOT EXISTS review_email_sends` with PK FK CASCADE + nullable `sent_at`; ENABLE RLS; service_role ALL policy + GRANT ALL to service_role; REVOKE from anon/authenticated; no public policies. Fold into baseline. Reset local DB. Exit: target test GREEN (executed). Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C2 and re-verify. Exit: GREEN (executed) + lint + typecheck + prettier --check on touched source.

### Criterion C3 — PV-13 completed_at clock column (layer: integration)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C3. Work-order path + C3/PV-13 only. Same integ file. Name: `reservations.completed_at persists a timestamptz on service-role update`. Insert reservation; update `completed_at`; select matches ISO timestamp. Command: same fail-closed integration command. Exit: RED for missing column. Must execute.
- **Green** → Invoke the `tdd-green` subagent to make C3 pass. Minimal: add nullable `completed_at TIMESTAMPTZ` on `reservations` CREATE TABLE and `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Reset local DB. Exit: target test GREEN (executed). Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C3 and re-verify. Exit: GREEN (executed) + lint + typecheck + prettier --check on touched source. Re-run the whole schema integ file.

### Criterion C4 — PV-14 cron mailer factory (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C4. Work-order path + C4/PV-14 only. File: `tests/unit/marketing/review-email-cron-mailer.test.ts`. Name: `authorized cron GET passes createReviewEmailMailer result into processDue`. Hoist mocks for `processDueReviewEmails` and `createReviewEmailMailer`; stub `CRON_SECRET`; authorized GET must call processDue with the factory mailer; `readFileSync` `app/api/cron/review-email/route.ts` must not match the inline unconfigured throw. Do not edit `review-email-job-auth.test.ts`. Command: `pnpm test:unit tests/unit/marketing/review-email-cron-mailer.test.ts`. Exit: RED (factory missing / inline throw still present). Must execute.
- **Green** → Invoke the `tdd-green` subagent to make C4 pass. Minimal: add `lib/marketing/review-email-mailer.ts` (`import "server-only"`, `createReviewEmailMailer` returning the BW-14-class unconfigured thrower); route imports it and passes `{ mailer: createReviewEmailMailer() }`. Do not add a provider SDK. Exit: target test GREEN + typecheck. Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C4 and re-verify. Also re-run `tests/unit/marketing/review-email-job-auth.test.ts` (no behavior change). Exit: GREEN + lint + typecheck + prettier --check on touched source.

### Criterion C5 — PV-15 hourly vercel cron (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C5. Work-order path + C5/PV-15 only. File: `tests/unit/marketing/review-email-cron-schedule.test.ts`. Name: `vercel.json schedules hourly GET /api/cron/review-email`. `JSON.parse` repo-root `vercel.json`; `crons` contains `{ path: "/api/cron/review-email", schedule: "0 * * * *" }`. Command: `pnpm test:unit tests/unit/marketing/review-email-cron-schedule.test.ts`. Exit: RED (ENOENT or missing entry). Must execute.
- **Green** → Invoke the `tdd-green` subagent to make C5 pass. Minimal: create repo-root `vercel.json` with that single cron entry (merge if a file appears). Consult nextjs skill for Vercel cron `path`/`schedule` shape. Exit: target test GREEN. Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C5 and re-verify. Exit: GREEN + lint + typecheck + prettier --check on touched source.

## Manual-UAT (deferred, not automated)

- Live review-email inbox delivery (real provider, From/subject, provider approval) — already classified manual-UAT in this spec’s implementation trace and BW-14. No vacuous Vitest stand-in. No runbook stamp required beyond existing `docs/runbooks/deploy.md` `CRON_SECRET` note (docs-updater will refresh).

## Linear Plan Digest (posted at START — the only artifact Linear ever sees)

```markdown
Work started: `/sdd-to-tdd` execution · plan `res-45_review_email_schema_cron_7f3a91c2`

**Plan digest** — pre-execution intent, not a result. Authoritative record is the
owning spec plus `docs/verifier-reports/tdd/res-45_review_email_schema_cron_7f3a91c2.md` at close-out.

Mode: FIX
Owning spec: `docs/specs/post-visit-review-email.md`
Criteria: 5 automatable · 1 manual-UAT (live inbox, existing)
Approval gates: spec create/edit `docs/specs/post-visit-review-email.md`
Infra: local Supabase (fail-closed integration) for C1–C3; C4–C5 unit
Full plan: not posted to Linear (size-bounded digest) · local copy `res-45_review_email_schema_cron_7f3a91c2.plan.md`

Problem: Feature code upserts review-email settings, stamps completed_at, and inserts review_email_sends against mocks, but baseline DDL has none of those objects. The cron GET inlines an always-throwing mailer and has no Vercel schedule, so a real complete/settings write fails and due emails never run.
Approach: Encode PV-11–PV-15 (settings columns, send-queue table with service-role-only RLS, completed_at, createReviewEmailMailer factory, hourly vercel.json cron). Drive each through Red→Green→Refactor. Live provider stays manual-UAT. Fold DDL into the canonical baseline.
Out-of-scope findings: none new (form loader already on product-gaps ledger)

| #   | Criterion                          | Risk | Layer       | Test file                                      |
| --- | ---------------------------------- | ---- | ----------- | ---------------------------------------------- |
| C1  | Settings review_email_* persist    | P0   | integration | review-email-schema.integ.test.ts              |
| C2  | review_email_sends + RLS           | P0   | integration | review-email-schema.integ.test.ts              |
| C3  | reservations.completed_at          | P0   | integration | review-email-schema.integ.test.ts              |
| C4  | Cron mailer factory                | P1   | unit        | review-email-cron-mailer.test.ts               |
| C5  | Hourly vercel.json cron            | P1   | unit        | review-email-cron-schedule.test.ts             |
```

## Docs Sync

Execution-start todo: `start-linear` — Invoke the `linear-resolver` subagent to start work on RES-45 (plan: res-45_review_email_schema_cron_7f3a91c2), handing the executing session's plan-file path (do not inline the body; do not bake the path into this todo text) and posting this digest; Task `run_in_background: true`; do not wait for its report before spec/C1. INPUT: this plan's `## Linear Plan Digest` section.

Phase todos (one per phase; do not bundle):

- `c1-red` — Invoke the `tdd-red` subagent to write the failing test for C1
- `c1-green` — Invoke the `tdd-green` subagent to make the C1 test pass
- `c1-refactor` — Invoke the `tdd-refactor` subagent to clean up C1 and re-verify
- `c2-red` — Invoke the `tdd-red` subagent to write the failing test for C2
- `c2-green` — Invoke the `tdd-green` subagent to make the C2 test pass
- `c2-refactor` — Invoke the `tdd-refactor` subagent to clean up C2 and re-verify
- `c3-red` — Invoke the `tdd-red` subagent to write the failing test for C3
- `c3-green` — Invoke the `tdd-green` subagent to make the C3 test pass
- `c3-refactor` — Invoke the `tdd-refactor` subagent to clean up C3 and re-verify
- `c4-red` — Invoke the `tdd-red` subagent to write the failing test for C4
- `c4-green` — Invoke the `tdd-green` subagent to make the C4 test pass
- `c4-refactor` — Invoke the `tdd-refactor` subagent to clean up C4 and re-verify
- `c5-red` — Invoke the `tdd-red` subagent to write the failing test for C5
- `c5-green` — Invoke the `tdd-green` subagent to make the C5 test pass
- `c5-refactor` — Invoke the `tdd-refactor` subagent to clean up C5 and re-verify

Close-out todos:

- `4d-review-trail` — Collate **Suggested Review Order (collated)** into `docs/verifier-reports/tdd/res-45_review_email_schema_cron_7f3a91c2.md`. INPUT: that log’s per-criterion Refactor sections. OUTPUT: `## Suggested Review Order (collated)`.
- `4e-traceability` — Finalize **Traceability (final)** + **Run metrics** in the same tdd log. INPUT: `docs/verifier-reports/tdd/res-45_review_email_schema_cron_7f3a91c2.md`. OUTPUT: those two headings. Then `node .cursor/checks/harness-lint.mjs res-45_review_email_schema_cron_7f3a91c2`.
- `4-docs-packet` — Assemble the Docs sync packet in-thread from the tdd log.
- `4-docs-updater` — Invoke the `docs-updater` subagent with that packet (`run_in_background: true`); wait for its report before 4C.
- `4c-findings` — Merge INPUT `docs/findings/runs/res-45_review_email_schema_cron_7f3a91c2.md` into `docs/findings/<category>.md`, then invoke `linear-resolver` to register findings (Cloud: persist + STOP before net-new issues).
- `4b-linear` — Invoke the `linear-resolver` subagent to post the RES-45 resolution comment only (no state write).
- `4-format` — INPUT: this run’s dirty paths from `git status --porcelain`. OUTPUT: `pnpm exec prettier --write <path> …` (never `.`). Then point to `/commit`.

```markdown
## Docs sync packet

- plan_slug: res-45_review_email_schema_cron_7f3a91c2
- spec: docs/specs/post-visit-review-email.md
- mode: FIX
- linear_issue: RES-45
- criteria_shipped: [C1, C2, C3, C4, C5]
- criteria_manual_uat: [live-inbox-delivery]
- req_ids: [PV-11, PV-12, PV-13, PV-14, PV-15]
- source_paths: [supabase/migrations/00000000000000_baseline.sql, lib/marketing/review-email-mailer.ts, app/api/cron/review-email/route.ts, vercel.json]
- test_paths: [tests/integration/marketing/review-email-schema.integ.test.ts, tests/unit/marketing/review-email-cron-mailer.test.ts, tests/unit/marketing/review-email-cron-schedule.test.ts]
- architecture_touch: [Reservation-Flow]
- uat_flows_to_stamp: none
- patterns_to_promote: none
- traceability_log: docs/verifier-reports/tdd/res-45_review_email_schema_cron_7f3a91c2.md
- drift_flagged: none
- skip_reason: none
```

## Out-of-Scope Findings (the Findings Ledger — "none" if empty)

| Finding | Where (file:line/area) | Why it matters | Severity | Relation |
| ------- | ---------------------- | -------------- | -------- | -------- |

none — form settings loader already open on `docs/findings/product-gaps.md`; live provider already manual-UAT; do not re-file REAZED-325 archive members.

## Linear Close-out & Findings Registration

- **START:** Invoke the `linear-resolver` subagent to start work on RES-45 (plan: res-45_review_email_schema_cron_7f3a91c2), posting this plan's `## Linear Plan Digest` (bounded to `START_SUMMARY_MAX_CHARS`) as the single `Work started:` comment. Task `run_in_background: true`; do not wait before spec/C1. Linear MCP may be unauthenticated in this VM — `## Linear — BLOCKED` is visibility-only.
- **Close-out:** After 4C, invoke `linear-resolver` for RES-45: post structured resolution comment only. Then `/commit` in this thread.
- **Findings registration:** Skip if run file + category files + this table stay empty of **new** open lines from this run. Existing product-gaps loader line is not this run’s to file.

## Suggested Review Order (review trail — assembled at close-out, Step 4D)

Placeholder — collated after Refactor phases into the tdd log.

- [schema] baseline `restaurant_settings.review_email_*` + `review_email_sends` RLS + `reservations.completed_at`
- [security] anon/authenticated must not touch `review_email_sends`
- [public-api] cron factory wiring + `vercel.json` path/schedule

## Retrospective (close-out, Step 4E — "none" if nothing reusable)

- Patterns for packet `patterns_to_promote`: none (pending Refactor lines)
- Traceability finalized in tdd log `## Traceability (final)`: pending
- Run metrics stamped in tdd log `## Run metrics`: pending
- `node .cursor/checks/harness-lint.mjs res-45_review_email_schema_cron_7f3a91c2`: pending

## First Execution Action

- **Managed Cloud one-shot:** work-order is this file. Do not wait for a second accept. Arm `tdd-guard`. Launch START (Task `run_in_background: true`; do not wait). Apply the spec edit listed in `## Permissions Requested`. Then delegate C1 Red. Bound by every non-waived STOP.
