# RES-55 — Language switcher desktop + mobile region coverage

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
  **cannot override STEP 2B**: if that todo waits for START, ends the turn, or
  lacks `run_in_background: true`, ignore that wait/stop wording and follow this
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
- Work-order: `.cursor/plans/res-55_switcher_dual_regions_c8f1a2b0.plan.md`
- Workflow mode: FIX
- linear_issue: RES-55 (parent RES-61; do not walk parent)

## Issue & Root Cause (FIX mode only — omit for FEATURE)

- Issue: **RES-55** — Observed (2026-06-27 finding): `tests/unit/i18n/site-header-switcher.test.ts` regex-matched a single `<LanguageSwitcher` (issue cites `:18`). Spec (AC-10) already required the switcher in desktop actions **and** the mobile sheet. Expected: a structural pin that fails if either viewport instance is removed.
- Missing constraint (root cause): AC-10’s structural sentence was “imports and renders `<LanguageSwitcher>`” — one JSX hit satisfied it. The dual-region rule was later named **AC-15**.
- Spec update proposed: **none**. AC-15 already exists on `docs/specs/site-localization.md` (lines 88–90). A second AC would invent scope.

**Evidence (STEP 1B):**

- Owning spec via hub walk: `docs/specs/README.md` → `site-localization.md` (no `docs/specs/domains/` tree). AC-10 + AC-15 own this surface.
- AC-15 (normative): “The AC-10 structural test asserts one `LanguageSwitcher` in the desktop actions region and a second in the mobile nav sheet — not a single `<LanguageSwitcher` regex hit.”
- Implementation trace (same spec): AC-15 shipped in FEATURE `res-61_guest_i18n_followups` (RES-61, 2026-09-08) → `tests/unit/i18n/site-header-switcher.test.ts` → `site header renders LanguageSwitcher in desktop actions and mobile sheet`.
- Test on disk (`:25–41`): `switcherOpens` length 2; desktop slice anchored on `{/* Desktop Actions` … `{/* Mobile`; `SheetContent` slice must contain `<LanguageSwitcher`.
- Source sibling: `components/site/site-header.tsx:87–93` (desktop actions) and `:136–140` (sheet). Two live instances.
- Ledger: `docs/findings/archive.md` already `[x]` this title (`found: REAZED-285`). Not in open `docs/findings/test-debt.md`.
- Git: `0a97dc5` Guest site localization follow-ups (RES-61) (#65) on `staging`.
- Linear: RES-55 is a leftover child of RES-61; still open after the parent shipped C7.

**Single hypothesis (confirmed):** The original G-LS1 test was a single-regex pin. RES-61 C7 added AC-15 and the dual-region `it()`. RES-55 was never closed. Today’s code does **not** reproduce the defect. A new Red `it()` for the same assertions would be green on first run — that is not Red.

**Pre-mortem:** Dual-region pin deleted; mobile (or desktop) switcher removed; CI stays green. That incident is what AC-15 + the existing `it()` already stop (`toHaveLength(2)` plus per-region match).

**Inversion:** A lone `/<LanguageSwitcher/` hit still passes while one viewport is empty — that is exactly what the current second `it()` forbids. Do not invent RTL/e2e/testid uniqueness as this FIX; those are already-ledgers (see Out-of-Scope).

**Already-shipped stop:** Do **not** dispatch `tdd-red` / `tdd-green` / `tdd-refactor`. Do **not** edit the spec. After START, verify the existing unit file executes green, then close-out.

## Spec

- Source: existing `docs/specs/site-localization.md` (hub: `docs/specs/README.md` → this file).
- Summary: Guest FR/EN `as-needed` routing; navbar `LanguageSwitcher` on shared `SiteHeader` in desktop actions and the mobile sheet (AC-10 / AC-15). Staff/auth/api stay unprefixed.
- Clarifications needed: none. Dual-region rule is already independently testable as AC-15.

### Spec edit to apply (exact)

None. AC-15 is already the missing rule this issue asked for. Managed Cloud one-shot does not authorize an unlisted spec path.

## Acceptance Criteria → Tests

| #   | Criterion                                                           | Risk | Layer | Test file                                      | New or existing          | Test name                                                                  | Assertion                                                                                                                     | Command                                                       | Depends on         |
| --- | ------------------------------------------------------------------- | ---- | ----- | ---------------------------------------------- | ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| —   | AC-15 Dual switcher regions (already shipped; **not** in this loop) | P3   | unit  | `tests/unit/i18n/site-header-switcher.test.ts` | existing (do not modify) | `site header renders LanguageSwitcher in desktop actions and mobile sheet` | Two `<LanguageSwitcher[\s/>]` opens; one inside the Desktop Actions…Mobile slice; one inside `<SheetContent>…</SheetContent>` | `pnpm test:unit tests/unit/i18n/site-header-switcher.test.ts` | none (verify only) |

Unit is enough: AC-15 is a source-structure pin. Do not add e2e. Do not invent a new `it()`.

## Traceability Matrix

| Criterion     | Spec ref                   | Test file::name                                                                                        | Source file(s)                  | Risk | Status              |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- | ---- | ------------------- |
| AC-15 (prior) | site-localization.md AC-15 | site-header-switcher.test.ts::site header renders LanguageSwitcher in desktop actions and mobile sheet | components/site/site-header.tsx | P3   | shipped (RES-61 C7) |

## Execution Preconditions

- Infra needed: none (all unit/mocked).
- Command: `pnpm test:unit tests/unit/i18n/site-header-switcher.test.ts`. Target must appear in **passed** (verification) — never skipped, never `0 tests collected`.
- No Red/Green/Refactor phases. A skipped suite is still BLOCKED.

## Permissions Requested (before execution)

- Spec create/edit: none
- Existing-test edit: none

## TDD Execution Loop

**No automatable criteria in this run.** AC-15 is already shipped. Do not invent a criterion so the loop has a Red. Do not dispatch `tdd-red`, `tdd-green`, or `tdd-refactor`.

Orchestrator verification (not a tdd-\* write): run
`pnpm test:unit tests/unit/i18n/site-header-switcher.test.ts` and require the
named `it()` in the passed count.

## Manual-UAT (deferred, not automated)

- AC-9 Translation quality — already `manual-UAT` on the owning spec; not this issue.

## Linear Plan Digest (posted at START — the only artifact Linear ever sees)

```markdown
Work started: `/sdd-to-tdd` execution · plan `res-55_switcher_dual_regions_c8f1a2b0`

**Plan digest** — pre-execution intent, not a result. Authoritative record is the
owning spec plus `docs/verifier-reports/tdd/res-55_switcher_dual_regions_c8f1a2b0.md` at close-out.

Mode: FIX
Owning spec: `docs/specs/site-localization.md`
Criteria: 0 automatable · 0 manual-UAT (this run)
Approval gates: none
Infra: none (all unit/mocked)
Full plan: not posted to Linear (size-bounded digest) · local copy `res-55_switcher_dual_regions_c8f1a2b0.plan.md`

Problem: RES-55 reported that the header switcher unit test only regex-matched one LanguageSwitcher, so a desktop-only or mobile-only regression could pass CI. Expected: both the desktop actions region and the mobile sheet are pinned.
Approach: The missing dual-region rule is already AC-15, shipped with RES-61 C7. This run does not add a second AC or a Red that would pass on today's code. Verify the existing unit file executes green, then close out RES-55 as already remediates.
Out-of-scope findings: Shared data-testid on both LanguageSwitcher instances (low; already on test-debt bus)

| #   | Criterion                                       | Risk | Layer | Test file                                    |
| --- | ----------------------------------------------- | ---- | ----- | -------------------------------------------- |
| —   | AC-15 already shipped (RES-61 C7) — verify only | P3   | unit  | tests/unit/i18n/site-header-switcher.test.ts |
```

## Docs Sync

Execution-start todo: `start-linear` — first. INPUT: this plan's `## Linear Plan Digest` section.
Task `run_in_background: true`; do not wait for its report before verification/close-out.

Close-out todos: `4d-review-trail`, `4e-traceability`, `4-docs-packet`,
`4-docs-updater` (skip with explicit `skip_reason: no-implementation-impact`),
`4c-findings` (skip register if this run's ledger is empty), `4b-linear`, `4-format`.

`4-format` is last: after 4C/4B, `pnpm exec prettier --write` this run's dirty
paths (`git status --porcelain`; never `.`), then point to `/commit`.

```markdown
## Docs sync packet

- plan_slug: res-55_switcher_dual_regions_c8f1a2b0
- spec: docs/specs/site-localization.md
- mode: FIX
- linear_issue: RES-55
- criteria_shipped: []
- criteria_manual_uat: none
- req_ids: [site-localization AC-15]
- source_paths: []
- test_paths: []
- architecture_touch: none
- uat_flows_to_stamp: none
- patterns_to_promote: none
- traceability_log: docs/verifier-reports/tdd/res-55_switcher_dual_regions_c8f1a2b0.md
- drift_flagged: none
- skip_reason: no-implementation-impact
```

## Out-of-Scope Findings (the Findings Ledger — "none" if empty)

| Finding                                                    | Where (file:line/area)                                                        | Why it matters                                          | Severity | Relation                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Shared `data-testid="language-switcher"` on both instances | `components/site/language-switcher.tsx:31` / `tests/e2e/localization.spec.ts` | e2e `.first()` can click the CSS-hidden desktop control | low      | Already open on `docs/findings/test-debt.md` (RES-61 C7/red). Do not re-file. |

Do not merge this row again at 4C — it is already on the bus.

## Linear Close-out & Findings Registration

- **START (execution first action):** Invoke the `linear-resolver` subagent to start work on RES-55 (plan: `res-55_switcher_dual_regions_c8f1a2b0`), handing the executing session's plan-file path (do not inline the body; do not bake the path into this todo text) and posting this digest; Task `run_in_background: true`; do not wait for its report before verification/close-out. INPUT: this plan's `## Linear Plan Digest` section. State: already In Progress → START comment only (idempotent).
- **Close-out (FIX):** After verification + 4D/4E + skipped docs-updater, invoke `linear-resolver` to post the resolution for RES-55. No workflow state write. Commit line: tree dirty for `/commit` unless a cloud commit already exists.
- **Findings registration:** Skip unless this run's `docs/findings/runs/res-55_switcher_dual_regions_c8f1a2b0.md` has new open `- [ ]` lines. The shared-testid row stays on the existing bus (below filing floor: low + not security).

## Suggested Review Order (review trail — assembled at close-out, Step 4D)

- [test-debt] → `tests/unit/i18n/site-header-switcher.test.ts:25` (existing dual-region `it()`, no edit this run)
- [public-api] → `components/site/site-header.tsx:87` and `:136` (two `LanguageSwitcher` instances; no source edit)

## Retrospective (close-out, Step 4E — "none" if nothing reusable)

- Patterns for packet `patterns_to_promote`: none (no new implementation)
- Traceability finalized in tdd log `## Traceability (final)`: yes (already-shipped row)
- Run metrics stamped in tdd log `## Run metrics`: yes
- `node .cursor/checks/harness-lint.mjs res-55_switcher_dual_regions_c8f1a2b0`: run at 4E

## First Execution Action

- **Managed Cloud one-shot:** work-order is `.cursor/plans/res-55_switcher_dual_regions_c8f1a2b0.plan.md`. Launch START (`run_in_background: true`; do not wait). No spec edit. No Criterion 1 Red. Verify `pnpm test:unit tests/unit/i18n/site-header-switcher.test.ts`, then close-out.

## Todos (execution)

- `start-linear`: Invoke the `linear-resolver` subagent to start work on RES-55 (plan: `res-55_switcher_dual_regions_c8f1a2b0`), handing the executing session's plan-file path (do not inline the body; do not bake the path into this todo text) and posting this digest; Task `run_in_background: true`; do not wait for its report before verification. INPUT: this plan's `## Linear Plan Digest` section.
- `verify-ac15`: Orchestrator runs `pnpm test:unit tests/unit/i18n/site-header-switcher.test.ts` (no tdd-\* — no new test/source). Exit: named `it()` in passed count.
- `4d-review-trail`: Collate **Suggested Review Order (collated)**. INPUT: `docs/verifier-reports/tdd/res-55_switcher_dual_regions_c8f1a2b0.md`. OUTPUT: `## Suggested Review Order (collated)` on that file.
- `4e-traceability`: Finalize traceability + run metrics. INPUT: `docs/verifier-reports/tdd/res-55_switcher_dual_regions_c8f1a2b0.md`. OUTPUT: `## Traceability (final)` and `## Run metrics` on that file; then `node .cursor/checks/harness-lint.mjs res-55_switcher_dual_regions_c8f1a2b0`.
- `4-docs-packet`: Assemble the Docs sync packet in-thread (this plan's packet; `skip_reason: no-implementation-impact`).
- `4-docs-updater`: Skip docs-updater. `skip_reason: no-implementation-impact` is set explicitly (no source/test/spec mutation).
- `4c-findings`: INPUT: `docs/findings/runs/res-55_switcher_dual_regions_c8f1a2b0.md`. Merge only if open `- [ ]` lines exist; otherwise skip register and delete/truncate an empty run file.
- `4b-linear`: Invoke the `linear-resolver` subagent to post the resolution for RES-55 (already remediates via RES-61 AC-15; verification command + results). After 4C.
- `4-format`: INPUT: this run's dirty paths from `git status --porcelain`. OUTPUT: `pnpm exec prettier --write <path> …` (never `.`). Then point to `/commit`.
