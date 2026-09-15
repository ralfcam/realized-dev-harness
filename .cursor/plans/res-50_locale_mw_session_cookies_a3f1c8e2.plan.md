# RES-50 — Locale middleware and session-cookie coverage

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
- Work-order: `.cursor/plans/res-50_locale_mw_session_cookies_a3f1c8e2.plan.md`
- Workflow mode: FIX
- linear_issue: RES-50 (epic; children RES-43, RES-56, RES-51, RES-53, RES-52)

## Issue & Root Cause (FIX mode only — omit for FEATURE)

- Issue: **RES-50** (epic) with invoked children **RES-43**, **RES-56**, **RES-51**, **RES-53**, **RES-52**. Observed: `proxy.ts` copies `updateSession` cookies onto the next-intl response by `name`/`value` only; `tests/unit/i18n/middleware-scope.test.ts` never asserts cookies on localize paths (file-level mock is a plain `Response`); `/auth/error` and auth-path `proxy()` composition are untested; `resolveLocaleRoutingDecision` uses `pathname.startsWith(prefix)`, so `/authorship` (and `/administrator`, `/apiculture`, `/postal`, `/kdssuffix`) skip locale. Expected: localize-path merge forwards Set-Cookie options; cookies are asserted on localize paths; `/auth/**` including `/auth/error` skips locale through `proxy()`; exclusion is path-segment-bounded.
- Missing constraint (root cause): AC-3 requires `updateSession` on all paths and `/auth/**` skip, but never requires (1) session `Set-Cookie` options to survive the intl merge, (2) a localize-path cookie-propagation pin, (3) `/auth/error` + composition-root coverage, or (4) segment-boundary matching for `/**` prefixes.
- Spec update proposed: `docs/specs/site-localization.md` → tighten **AC-3**; add **AC-18** (cookie merge + options) and **AC-19** (segment-bounded exclusion, `/auth/error`, composition root). FIRST execution write after START.

**Evidence (STEP 1B):**

- `proxy.ts:16-18` — `for (const { name, value } of sessionResponse.cookies?.getAll() ?? []) { intlResponse.cookies.set(name, value) }` drops options.
- Sibling that already preserves options: `lib/supabase/proxy.ts:23-24` — `supabaseResponse.cookies.set(name, value, options)`.
- `tests/unit/i18n/middleware-scope.test.ts:4-5` mocks `updateSession` as `new Response()` (no `cookies`); no localize-path Set-Cookie assertion (RES-56).
- Auth `it()` (`:33-37`) only calls `resolveLocaleRoutingDecision` for `/auth`, `/auth/login`, `/auth/callback` — not `/auth/error`, not `proxy()` (RES-51, RES-53). Admin `it()` (`:17-31`) already drives `proxy()` + `updateSession`.
- `i18n/middleware-scope.ts:14` — `pathname.startsWith(prefix)` (RES-52). `/authorship`.startsWith(`/auth`) is true today.
- Owning spec via hub walk: `docs/specs/README.md` → `site-localization.md` (no `docs/specs/domains/` tree). AC-3 is the owner.

**Single hypothesis (confirmed):** Locale composition in `proxy` treats cookies as name/value pairs and treats exclusion prefixes as raw string prefixes. Both contradict the implied `/**` / session-refresh contract in AC-3. Not a next-intl bug and not a Supabase `setAll` bug — `updateSession` already forwards options onto its own response.

**Pre-mortem:** Feature “ships,” a staff session refreshes on `/en/menu`. Intl rewrite copies `sb-*` cookies without `HttpOnly`/`Secure` → XSS can read the session. A later public `/authorship` (or `/postal`) page is treated as excluded and never localized.

**Inversion:** A name/value-only cookie assertion passes while options are dropped (RES-56 without RES-43). A `/auth/login` helper-only assertion passes while `/authorship` is wrongly skipped and while `proxy()` could ignore the helper for `/auth/error`. AC-18 MUST assert `HttpOnly`/`Secure` (or the options object) on the composed localize response. AC-19 MUST include a lookalike that shares the prefix without a `/` boundary, plus `/auth/error` through `proxy()`.

## Spec

- Source: extend existing `docs/specs/site-localization.md` (hub: `docs/specs/README.md` → this file).
- Summary: Guest FR/EN `as-needed` routing; staff/auth/api excluded from locale prefixes; `updateSession` still runs. This FIX adds the session-cookie merge contract and makes `/**` exclusion segment-bounded, including `/auth/error` through the composition root.
- Clarifications needed: none. Cookie flags to preserve are those `getAll()` already returns (do not invent a flag list beyond `httpOnly`/`secure`/`sameSite`/`path`/`maxAge`). Lookalikes are hypothetical; no such routes exist today. Staff-gate `STAFF_PATHS` `startsWith` in `lib/supabase/proxy.ts` is out of scope (ledger).

### Spec edit to apply (exact)

In `docs/specs/site-localization.md`:

1. Set **Last updated** to `2026-09-09` (already that date — keep it).
2. In **AC-3 (Middleware scope)**, after the existing SA-2 sentence, append:

   Exclusion prefixes are path-segment-bounded: a pathname matches only when it
   equals the prefix or continues with `/` (`/auth`, `/auth/`, `/auth/**` —
   not `/authorship`; same rule for `/admin`, `/api`, `/pos`, `/kds`).
   `/auth/**` includes `/auth/login`, `/auth/callback`, and `/auth/error`.
   `/auth/**` skip MUST be proven through the composition root (`proxy` +
   `updateSession`, locale middleware not applied), matching the existing
   `/admin/**` pin.

3. After AC-17, append:

   18. **Session cookies survive locale merge** — On a localize path, every
       cookie present on the `updateSession` response MUST appear on the
       composed `proxy` response. `cookies.set` MUST forward the options
       object from `getAll()` (`httpOnly`, `secure`, `sameSite`, `path`, and
       `maxAge` / `expires` when present). Name/value-only copy does not
       satisfy this criterion. Skip-locale paths already return the session
       response unchanged.

   19. **Segment-bounded locale exclusion** — `resolveLocaleRoutingDecision`
       returns `skip-locale` iff the pathname is exactly an excluded prefix
       or is that prefix plus `/…`. Lookalikes that only share a string
       prefix (`/authorship`, `/administrator`, `/apiculture`, `/postal`,
       `/kdssuffix`) return `localize`. `/auth/error` returns `skip-locale`.
       `proxy("/auth/error")` and `proxy("/auth/login")` MUST call
       `updateSession` and MUST return that session response (locale
       middleware not applied).

4. Implementation-trace: add a FIX line for this plan after the AC-17 row
   is shipped (docs-updater owns the table rows at close-out; orchestrator
   does not invent trace rows during the spec edit beyond the AC text).

## Acceptance Criteria → Tests

| #   | Criterion | Risk | Layer | Test file | New or existing | Test name | Assertion | Command | Depends on |
| --- | --------- | ---- | ----- | --------- | --------------- | --------- | --------- | ------- | ---------- |
| C1  | AC-18 session cookies + Set-Cookie options survive locale merge | P0 | unit | `tests/unit/i18n/middleware-scope.test.ts` | add test (existing file) | `session cookies and Set-Cookie options survive locale merge` | Mock `updateSession` to return a `NextResponse` whose `cookies.set` used `{ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 }`. `proxy` on `/menu` (localize). Composed response has that cookie **and** `HttpOnly` + `Secure` (header or `cookies.get` options). Name/value-only is not enough. | `pnpm test:unit tests/unit/i18n/middleware-scope.test.ts` | none |
| C2  | AC-19 segment-bounded exclusion + `/auth/error` through `proxy()` | P2 | unit | `tests/unit/i18n/middleware-scope.test.ts` | add test | `locale exclusion is segment-bounded including auth/error through proxy` | `resolveLocaleRoutingDecision("/authorship" \| "/administrator" \| "/apiculture" \| "/postal" \| "/kdssuffix")` is `localize`; `"/auth/error"` is `skip-locale`; `proxy` on `/auth/error` and `/auth/login` calls `updateSession` and returns that same session response. | `pnpm test:unit tests/unit/i18n/middleware-scope.test.ts` | none |

Issue map: C1 = RES-43 + RES-56. C2 = RES-52 + RES-51 + RES-53. RES-51/53 pins that would be green alone are folded into C2 so the `it()` is still RED on lookalikes.

Unit is enough: `proxy` + `resolveLocaleRoutingDecision` are decidable with mocked `updateSession` (and optional mocked `runIntlMiddleware`). No integration/e2e.

Do **not** rewrite the existing three `it()`s. Do **not** edit `tests/unit/auth/staff-proxy.test.ts`.

## Traceability Matrix

| Criterion | Spec ref | Test file::name | Source file(s) | Risk | Status |
| --------- | -------- | --------------- | -------------- | ---- | ------ |
| C1 | AC-18 | middleware-scope.test.ts::session cookies and Set-Cookie options survive locale merge | proxy.ts | P0 | planned |
| C2 | AC-19 (+ AC-3 tighten) | middleware-scope.test.ts::locale exclusion is segment-bounded including auth/error through proxy | i18n/middleware-scope.ts | P2 | planned |

## Execution Preconditions

- Infra needed: none (all unit/mocked).
- Command: `pnpm test:unit tests/unit/i18n/middleware-scope.test.ts`. Target must appear in failed (Red) or passed (Green/Refactor) — never skipped, never `0 tests collected`.

## Permissions Requested (before execution)

- Spec create/edit: `docs/specs/site-localization.md` — tighten AC-3; add AC-18 and AC-19.
- Existing-test edit: `tests/unit/i18n/middleware-scope.test.ts` — add new `it()`s; file-level `updateSession` mock may stay `new Response()` if C1 overrides per-test. A file-level `runIntlMiddleware` mock is allowed only if C2 needs it and existing cases stay green. Do not rename/delete the existing three tests.

Managed Cloud one-shot: the initiating RES-50 task pre-authorizes **only** these paths.

## TDD Execution Loop

### Criterion C1 — AC-18 session cookies + options survive locale merge (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C1. Work-order: `.cursor/plans/res-50_locale_mw_session_cookies_a3f1c8e2.plan.md` (read C1 + AC-18 only). File: `tests/unit/i18n/middleware-scope.test.ts`. Name: `session cookies and Set-Cookie options survive locale merge`. Override `updateSession` to return `NextResponse.next()` with a session cookie set **with** `{ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 }`. Call `proxy` on a localize path (`/menu` or `/en/menu`). Assert the composed response emits that cookie **and** `HttpOnly` + `Secure` (prefer `set-cookie` header so a name/value-only `cookies.set(name, value)` cannot vacuous-pass). Do not edit the existing three `it()`s. Command: `pnpm test:unit tests/unit/i18n/middleware-scope.test.ts`. Exit: RED because options are dropped (`proxy.ts:16-18`). Must execute.
- **Green** → Invoke the `tdd-green` subagent to make C1 pass. Minimal: in `proxy.ts`, forward `options` from `getAll()` into `intlResponse.cookies.set(name, value, options)` — same shape as `lib/supabase/proxy.ts:23-24`. Do not change locale skip logic. Consult nextjs skill if `ResponseCookies.set` arity is unclear. Exit: target test GREEN (executed), typecheck clean. Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C1 and re-verify. Exit: target test GREEN (executed) + `pnpm lint` (0 warnings) + `pnpm typecheck` + `pnpm exec prettier --check` on touched source. Return adversarial `## Residual findings`, `Suggested review order:`, `Reusable pattern:`.

### Criterion C2 — AC-19 segment-bounded exclusion + auth/error through proxy (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for C2. Work-order path + C2/AC-19 only. Same test file. Name: `locale exclusion is segment-bounded including auth/error through proxy`. Assert lookalikes (`/authorship`, `/administrator`, `/apiculture`, `/postal`, `/kdssuffix`) are `localize`; `/auth/error` is `skip-locale`; `proxy("/auth/error")` and `proxy("/auth/login")` call `updateSession` and return that session response (same object). Do not edit C1 or the original three `it()`s. Command: `pnpm test:unit tests/unit/i18n/middleware-scope.test.ts`. Exit: RED because `startsWith("/auth")` classifies `/authorship` as `skip-locale`. Must execute.
- **Green** → Invoke the `tdd-green` subagent to make C2 pass. Minimal: match prefix only when `pathname === prefix \|\| pathname.startsWith(prefix + "/")` in `i18n/middleware-scope.ts`. Do not change `STAFF_PATHS` in `lib/supabase/proxy.ts` (out of scope). Exit: target test GREEN (executed). Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C2 and re-verify the whole `middleware-scope.test.ts` file. Exit: GREEN (executed) + lint + typecheck + prettier --check on touched source.

## Manual-UAT (deferred, not automated)

- None for this FIX. Spec AC-9 (translation quality) remains the existing manual-UAT and is not this run.

## Linear Plan Digest (posted at START — the only artifact Linear ever sees)

```markdown
Work started: `/sdd-to-tdd` execution · plan `res-50_locale_mw_session_cookies_a3f1c8e2`

**Plan digest** — pre-execution intent, not a result. Authoritative record is the
owning spec plus `docs/verifier-reports/tdd/res-50_locale_mw_session_cookies_a3f1c8e2.md` at close-out.

Mode: FIX
Owning spec: `docs/specs/site-localization.md`
Criteria: 2 automatable · 0 manual-UAT
Approval gates: spec create/edit `docs/specs/site-localization.md` · existing-test edit `tests/unit/i18n/middleware-scope.test.ts`
Infra: none (all unit/mocked)
Full plan: not posted to Linear (size-bounded digest) · local copy `res-50_locale_mw_session_cookies_a3f1c8e2.plan.md`

Problem: On localize paths, proxy copies session cookies onto the intl response by name and value only, so HttpOnly/Secure/SameSite from a Supabase refresh can be dropped. Exclusion uses raw startsWith, so lookalikes like /authorship skip locale. Middleware-scope tests never pin cookies, /auth/error, or auth through the composition root.
Approach: Add AC-18 (forward getAll options on merge) and AC-19 (segment-bounded prefixes, /auth/error skip through proxy). Drive C1 then C2 through Red→Green→Refactor. Children RES-43/56 map to C1; RES-52/51/53 map to C2. Staff-gate startsWith in lib/supabase/proxy.ts stays out of scope.
Out-of-scope findings: staff-path startsWith is segment-unaware (lib/supabase/proxy.ts STAFF_PATHS) · med

| #   | Criterion                                              | Risk | Layer | Test file                    |
| --- | ------------------------------------------------------ | ---- | ----- | ---------------------------- |
| C1  | Session cookies + Set-Cookie options survive locale merge | P0   | unit  | middleware-scope.test.ts     |
| C2  | Segment-bounded exclusion + auth/error through proxy   | P2   | unit  | middleware-scope.test.ts     |
```

## Docs Sync

Execution-start todo: `start-linear` — Invoke the `linear-resolver` subagent to start work on RES-50 (plan: res-50_locale_mw_session_cookies_a3f1c8e2), handing the executing session's plan-file path (do not inline the body; do not bake the path into this todo text) and posting this digest; Task `run_in_background: true`; do not wait for its report before spec/C1. INPUT: this plan's `## Linear Plan Digest` section.

Phase todos (one per phase; do not bundle):

- `c1-red` — Invoke the `tdd-red` subagent to write the failing test for C1
- `c1-green` — Invoke the `tdd-green` subagent to make the C1 test pass
- `c1-refactor` — Invoke the `tdd-refactor` subagent to clean up C1 and re-verify
- `c2-red` — Invoke the `tdd-red` subagent to write the failing test for C2
- `c2-green` — Invoke the `tdd-green` subagent to make the C2 test pass
- `c2-refactor` — Invoke the `tdd-refactor` subagent to clean up C2 and re-verify

Close-out todos:

- `4d-review-trail` — Collate **Suggested Review Order (collated)** into `docs/verifier-reports/tdd/res-50_locale_mw_session_cookies_a3f1c8e2.md`. INPUT: that log’s per-criterion Refactor sections. OUTPUT: `## Suggested Review Order (collated)`.
- `4e-traceability` — Finalize **Traceability (final)** + **Run metrics** in the same tdd log. INPUT: `docs/verifier-reports/tdd/res-50_locale_mw_session_cookies_a3f1c8e2.md`. OUTPUT: those two headings. Then `node .cursor/checks/harness-lint.mjs res-50_locale_mw_session_cookies_a3f1c8e2`.
- `4-docs-packet` — Assemble the Docs sync packet in-thread from the tdd log.
- `4-docs-updater` — Invoke the `docs-updater` subagent with that packet (`run_in_background: true`); wait for its report before 4C.
- `4c-findings` — Merge INPUT `docs/findings/runs/res-50_locale_mw_session_cookies_a3f1c8e2.md` into `docs/findings/<category>.md`, then invoke `linear-resolver` to register findings (Cloud: persist + STOP before net-new issues).
- `4b-linear` — Invoke the `linear-resolver` subagent to post the RES-50 resolution comment only (no state write). Mention children RES-43, RES-56, RES-51, RES-53, RES-52 in that comment.
- `4-format` — INPUT: this run’s dirty paths from `git status --porcelain`. OUTPUT: `pnpm exec prettier --write <path> …` (never `.`). Then point to `/commit`.

```markdown
## Docs sync packet

- plan_slug: res-50_locale_mw_session_cookies_a3f1c8e2
- spec: docs/specs/site-localization.md
- mode: FIX
- linear_issue: RES-50
- criteria_shipped: [C1, C2]
- criteria_manual_uat: none
- req_ids: [AC-18, AC-19]
- source_paths: [proxy.ts, i18n/middleware-scope.ts]
- test_paths: [tests/unit/i18n/middleware-scope.test.ts]
- architecture_touch: none
- uat_flows_to_stamp: none
- patterns_to_promote: none
- traceability_log: docs/verifier-reports/tdd/res-50_locale_mw_session_cookies_a3f1c8e2.md
- drift_flagged: none
- skip_reason: none
```

## Out-of-Scope Findings (the Findings Ledger — "none" if empty)

| Finding | Where (file:line/area) | Why it matters | Severity | Relation |
| ------- | ---------------------- | -------------- | -------- | -------- |
| Staff-path `startsWith` is segment-unaware | `lib/supabase/proxy.ts:35-36` (`STAFF_PATHS`) | `/administrator` would be treated as `/admin` and redirected by the staff gate. Same class as AC-19, different owner (`staff-authorization.md` SA-2). | med | out of scope — do not change `updateSession` this run |

Duplicate locale vs staff prefix lists already open on `docs/findings/tech-debt.md` — do not re-file.

## Linear Close-out & Findings Registration

- **START:** Invoke the `linear-resolver` subagent to start work on RES-50 (plan: res-50_locale_mw_session_cookies_a3f1c8e2), posting this plan's `## Linear Plan Digest` (bounded to `START_SUMMARY_MAX_CHARS`) as the single `Work started:` comment. Task `run_in_background: true`; do not wait before spec/C1. Invoked issue only (RES-50). Already In Progress is a no-op for state; the summary comment still posts. Do not walk children.
- **Close-out:** After 4C, invoke `linear-resolver` for RES-50: post structured resolution comment only. Then `/commit` in this thread.
- **Findings registration:** Merge the run file’s staff-path `startsWith` line into `docs/findings/security.md` or `tech-debt.md` as categorized. Cloud: persist + STOP before net-new Linear issues.

## Suggested Review Order (review trail — assembled at close-out, Step 4D)

Placeholder — collated after Refactor phases into the tdd log.

- [security] `proxy.ts` cookie merge options
- [auth] `i18n/middleware-scope.ts` segment-bounded prefixes

## Retrospective (close-out, Step 4E — "none" if nothing reusable)

- Patterns for packet `patterns_to_promote`: none (pending Refactor lines)
- Traceability finalized in tdd log `## Traceability (final)`: pending
- Run metrics stamped in tdd log `## Run metrics`: pending
- `node .cursor/checks/harness-lint.mjs res-50_locale_mw_session_cookies_a3f1c8e2`: pending

## First Execution Action

- **Managed Cloud one-shot:** work-order is this file. Do not wait for a second accept. Arm `tdd-guard`. Launch START (Task `run_in_background: true`; do not wait). Apply the spec edit listed in `## Permissions Requested`. Then delegate C1 Red. Bound by every non-waived STOP.
