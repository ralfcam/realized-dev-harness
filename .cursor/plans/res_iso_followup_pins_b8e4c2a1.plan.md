# Isolation follow-up — High RES-39 findings (scan + marketing + POS)

## Execution Protocol (MANDATORY — read first when executing this plan)

You are the **orchestrator**, not an implementer. When this plan is executed:

- Your **only direct writes** are: (1) the **approved spec edit** under
  `docs/specs/**` (managed Cloud: the exact paths listed in
  `## Permissions Requested`), (2) the findings revision pass on
  `docs/findings/runs/res_iso_followup_pins_b8e4c2a1.md` after every phase
  (and, at close-out, the merge of its open lines into
  `docs/findings/<category>.md` + prune to `archive.md`), (3) appending
  Refactor close-out sections to
  `docs/verifier-reports/tdd/res_iso_followup_pins_b8e4c2a1.md` after each
  `tdd-refactor` phase, and (4) at close-out, **`## Suggested Review Order
(collated)`**, **`## Traceability (final)`**, and **`## Run metrics`** in
  the same tdd log. **Managed Cloud only, before execution:** also write this
  work-order. After a spec or living-findings write, `pnpm exec prettier
--write` **that file** (never `.`). Snapshot trees are prettierignored.
  Everything else is delegated.
- **Every test change** comes from a `tdd-red` Task call. **Every source
  change** from `tdd-green`. **Every cleanup / re-verify** from
  `tdd-refactor`. Run them sequentially, one **phase** at a time.
- **Do not mark a phase done on subagent assertion alone.** The target
  test's actual pass/fail must be visible in the returned report.
- **One Task call per phase.** Never bundle Red+Green+Refactor.
- **Never pass `model` on Task** for `tdd-red` / `tdd-green` /
  `tdd-refactor` / `docs-updater` / `linear-resolver`.
- You MUST NOT edit `tests/**`, `lib/**`, `app/**`, `components/**`,
  `hooks/**`, `src/**`, or `supabase/**` yourself.
- No tracked Linear issue (`linear_issue: none`) — **skip START**.
- **Close-out sequence:** 4D → 4E → Docs sync packet → docs-updater → 4C
  → format pass → `/commit`. Do not auto-confirm net-new Linear finding
  issues.
- If you cannot delegate, STOP. Arm `tdd-guard` as the first execution
  action and disarm it last.

## Mode Check

- Plan Mode: CLOUD-MANAGED (one-shot)
- Cloud runtime: `agent/runtime` = managed
- Work-order: `.cursor/plans/res_iso_followup_pins_b8e4c2a1.plan.md`
- Workflow mode: FIX
- linear_issue: none

## Issue & Root Cause (FIX mode only)

- Issue: free-text `/sdd-to-tdd Findings` — operator confirmation of the
  three High leftovers from RES-39 (plan
  `res-39_pin_reservation_integ_local_a7c3e1f2`). Observed: (1) the
  reservation isolation scan treats
  `assertIsolatedHoursMutationTarget("http://127.0.0.1:54321")` as a valid
  pin while `createServiceClient()` still follows remote
  `NEXT_PUBLIC_SUPABASE_URL`; (2) `tests/integration/marketing/review-email-schema.integ.test.ts`
  mutates `restaurant_settings` / `reservations` / `review_email_sends`
  with no pin; (3) `tests/integration/pos/orders-persistence.integ.test.ts`
  inserts/deletes `orders` with no pin. Expected: same fail-closed
  local-only pin as RES-ISO / OH-SAVE, and the reservation scan MUST reject
  an explicit-URL helper call.
- Missing constraint: RES-ISO never required a **zero-argument** helper
  call; `post-visit-review-email.md` and `menu-availability.md` never
  require a local-only pin on their mutating integ globs.
- Spec updates proposed (FIRST execution writes): tighten RES-ISO;
  add **PV-ISO**; add **ORD-ISO**.

**Evidence (STEP 1B):**

- Ledger (`docs/findings/test-debt.md`): three `high` lines found
  `tdd/res-39_pin_reservation_integ_local_a7c3e1f2`. Linear search found
  no open sibling issue besides RES-39 (already shipped).
- `tests/unit/reservations/reservation-integ-isolation.test.ts:42-51`
  `isHelperCall` checks callee name only — `arguments.length` is ignored.
  Scheduling §15 still owns “explicit URL wins” for the helper itself.
- Marketing integ: `createServiceClient()` in `beforeEach` / `afterEach` /
  `beforeAll` / cleanup helpers; no `assertIsolatedHoursMutationTarget`.
- POS integ: `afterEach` delete + `it()` insert via `createServiceClient()`;
  no pin; no `beforeAll`.
- Sibling: reservation suites +
  `tests/integration/scheduling/replace-operating-windows.integ.test.ts`
  already call the helper. `lib/supabase/service.ts` stays unguarded.

**Pre-mortem:** Scan “ships” but a suite pins a hard-coded local URL and
still writes through remote env. Marketing/POS keep mutating
`tilcqrudqxznnpepxjqq` when `.env` points there.

**Inversion:** A comment or `assertIsolatedHoursMutationTarget(localUrl)`
must not pass the scan. Marketing `beforeEach` snapshot/upsert is a write
— pinning only `afterEach` still lets `beforeEach` hit the remote.

Clarifications needed: none. Same class as RES-39; operator named Findings.

## Spec

- Source: extend existing `docs/specs/booking-rules.md`,
  `docs/specs/post-visit-review-email.md`,
  `docs/specs/menu-availability.md` (hub: `docs/specs/README.md`; no
  `docs/specs/domains/` tree).
- Summary: Close the RES-ISO explicit-URL scan hole and pin the two
  remaining mutating integ folders that share the RES-39 class.
- Clarifications needed: none.

### Spec edits to apply (exact)

**1. `docs/specs/booking-rules.md` — tighten RES-ISO (item 21)**

After “Call it as the **first statement** of `beforeAll` and of every
cleanup hook that writes (`afterEach` / `afterAll`).” insert:

The call MUST be **zero-argument**
(`assertIsolatedHoursMutationTarget()`). A call that passes an explicit
URL MUST be treated as missing the pin: the helper’s “explicit URL wins”
rule (scheduling.md §15) would accept a local string while
`createServiceClient()` still uses `NEXT_PUBLIC_SUPABASE_URL`. The unit
scan MUST reject `arguments.length !== 0`. Helper fail-closed behavior
stays owned by scheduling §15.

Update the RES-ISO implementation-trace row to mention the zero-arg scan.
Set **Last updated** to `2026-09-09` (already that date — keep it).

**2. `docs/specs/post-visit-review-email.md` — add PV-ISO (item 16)**

Set **Last updated** to `2026-09-09`. After item 15 (PV-15), append:

16. **PV-ISO — Mutating review-email integration is local-only.** Mutating
    automated coverage under `tests/integration/marketing/*.integ.test.ts`
    (settings upsert/restore, `review_email_sends` / `reservations`
    inserts and cleanup) MUST run only against **local** Supabase
    (`NEXT_PUBLIC_SUPABASE_URL` host `127.0.0.1`, `localhost`, or `[::1]`).
    It MUST fail closed — not skip — when the URL is the shared linked
    project `tilcqrudqxznnpepxjqq` (or any other non-local host). Use
    `authEnvReady` / `RESTAURANT_INTEGRATION_STRICT` **plus**
    `assertIsolatedHoursMutationTarget()` from
    `lib/scheduling/hours-mutation-target.ts` (same helper as
    booking-rules RES-ISO / scheduling.md §15). Call it as the **first
    statement** of every write hook that exists (`beforeAll`,
    `beforeEach`, `afterEach`, `afterAll`). The call MUST be
    zero-argument. Do not put the guard in `createServiceClient`. A new
    file matching that glob MUST include the same pin.

Add an implementation-trace row for PV-ISO pointing at
`tests/unit/marketing/review-email-schema-isolation.test.ts`.

**3. `docs/specs/menu-availability.md` — add AC-6 ORD-ISO**

Set **Last updated** to `2026-09-09`. After item 5 (Orders schema
persistence), append:

6. **ORD-ISO — Mutating POS order integration is local-only.** Mutating
   automated coverage under `tests/integration/pos/*.integ.test.ts`
   (service-role `orders` / `order_items` insert and cleanup delete) MUST
   run only against **local** Supabase (`NEXT_PUBLIC_SUPABASE_URL` host
   `127.0.0.1`, `localhost`, or `[::1]`). It MUST fail closed — not skip —
   when the URL is the shared linked project `tilcqrudqxznnpepxjqq` (or
   any other non-local host). Use `authEnvReady` /
   `RESTAURANT_INTEGRATION_STRICT` **plus**
   `assertIsolatedHoursMutationTarget()` from
   `lib/scheduling/hours-mutation-target.ts` (same helper as booking-rules
   RES-ISO / scheduling.md §15). Call it as the **first statement** of
   `beforeAll` and of every cleanup hook that writes (`afterEach` /
   `afterAll`). The call MUST be zero-argument. Add `beforeAll` when the
   suite has none so the pin runs before the first `it()` write. Do not
   put the guard in `createServiceClient`. A new file matching that glob
   MUST include the same pin.

Add an implementation-trace row for ORD-ISO pointing at
`tests/unit/pos/orders-persistence-isolation.test.ts`.

## Acceptance Criteria → Tests

| #   | Criterion             | Risk | Layer | Test file                                                     | New or existing | Test name                                                                                                                         | Assertion                                                                                                                                                                                                                                               | Command                                                                      | Depends on |
| --- | --------------------- | ---- | ----- | ------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- |
| C1  | RES-ISO zero-arg scan | P0   | unit  | `tests/unit/reservations/reservation-integ-isolation.test.ts` | existing        | `reservation integ suites call assertIsolatedHoursMutationTarget before mutating writes` (same `it`, plus explicit-URL rejection) | A synthetic `assertIsolatedHoursMutationTarget("http://127.0.0.1:54321")` first-statement is **not** a valid pin (`isHelperCall` requires `arguments.length === 0`). Real glob files must still satisfy the existing import + first-statement contract. | `pnpm test:unit tests/unit/reservations/reservation-integ-isolation.test.ts` | none       |
| C2  | PV-ISO marketing pin  | P0   | unit  | `tests/unit/marketing/review-email-schema-isolation.test.ts`  | new file        | `marketing integ suites call assertIsolatedHoursMutationTarget before mutating writes`                                            | Every `tests/integration/marketing/*.integ.test.ts` named-imports the helper and calls `assertIsolatedHoursMutationTarget()` (zero-arg) as the first statement of every `beforeAll` / `beforeEach` / `afterEach` / `afterAll`.                          | `pnpm test:unit tests/unit/marketing/review-email-schema-isolation.test.ts`  | none       |
| C3  | ORD-ISO POS pin       | P0   | unit  | `tests/unit/pos/orders-persistence-isolation.test.ts`         | new file        | `POS integ suites call assertIsolatedHoursMutationTarget before mutating writes`                                                  | Every `tests/integration/pos/*.integ.test.ts` named-imports the helper and calls `assertIsolatedHoursMutationTarget()` (zero-arg) as the first statement of `beforeAll` and every `afterEach` / `afterAll`. Missing `beforeAll` is a failure.           | `pnpm test:unit tests/unit/pos/orders-persistence-isolation.test.ts`         | none       |

All three are unit file-scans (same layer justification as RES-39 C1). Do
not re-test the helper host matrix. Do not require integration against the
linked remote. No e2e. No manual-UAT.

C1–C3 are **test-only wiring** after each Red scan is proven RED. Green
has **no application source**. Do not put the guard in
`createServiceClient`. Do not invent a second helper.

## Traceability Matrix

| Criterion | Spec ref                            | Test file::name                                                                                                             | Source file(s)                       | Risk | Status  |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---- | ------- |
| C1        | booking-rules.md RES-ISO (zero-arg) | reservation-integ-isolation.test.ts::reservation integ suites call assertIsolatedHoursMutationTarget before mutating writes | none (tighten scan only)             | P0   | planned |
| C2        | post-visit-review-email.md PV-ISO   | review-email-schema-isolation.test.ts::marketing integ suites call assertIsolatedHoursMutationTarget before mutating writes | none (wire existing marketing integ) | P0   | planned |
| C3        | menu-availability.md ORD-ISO        | orders-persistence-isolation.test.ts::POS integ suites call assertIsolatedHoursMutationTarget before mutating writes        | none (wire existing POS integ)       | P0   | planned |

## Execution Preconditions

- Infra needed: none (all unit file-read / AST). Integration suites are
  not these criteria’s gates.
- Migrations: none.
- Reuse `assertIsolatedHoursMutationTarget`. No new helper.

## Permissions Requested (before execution)

- Spec create/edit: `docs/specs/booking-rules.md` — RES-ISO zero-arg
  sentence + trace row.
- Spec create/edit: `docs/specs/post-visit-review-email.md` — add PV-ISO
  (item 16) + Last updated + trace row.
- Spec create/edit: `docs/specs/menu-availability.md` — add ORD-ISO
  (item 6) + Last updated + trace row.
- Existing-test edit: `tests/unit/reservations/reservation-integ-isolation.test.ts`
  — require zero-arg `isHelperCall`; keep the existing `it` name.
- Existing-test edit: `tests/integration/marketing/review-email-schema.integ.test.ts`
  — import + first-statement zero-arg pin on every write hook. Do not
  change assertions or dates.
- Existing-test edit: `tests/integration/pos/orders-persistence.integ.test.ts`
  — import + add `beforeAll` pin + first-statement pin on `afterEach`.
  Do not change assertions or probe constants.

Managed Cloud one-shot: `/sdd-to-tdd Findings` pre-authorizes **only**
these paths.

## TDD Execution Loop

### Criterion C1 — RES-ISO zero-arg scan (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for
  C1. Work-order: `.cursor/plans/res_iso_followup_pins_b8e4c2a1.plan.md`
  (read C1 + RES-ISO). File:
  `tests/unit/reservations/reservation-integ-isolation.test.ts`. Keep the
  existing `it` name. Extend the same scan so a synthetic
  `beforeAll(() => { assertIsolatedHoursMutationTarget("http://127.0.0.1:54321") })`
  is recorded as a failure (“scan accepted an explicit-URL helper call”).
  Do **not** change `isHelperCall` yet — today’s callee-name-only check
  must make that failure fire. Command:
  `pnpm test:unit tests/unit/reservations/reservation-integ-isolation.test.ts`.
  Exit: RED on that explicit-URL acceptance, not a harness error.
- **Red-wire** → Invoke the `tdd-red` subagent to apply the authorized
  existing-test edit: `isHelperCall` requires
  `ts.isCallExpression(callee) && callee.arguments.length === 0`. Re-run
  the C1 unit command. Exit: GREEN (executed). Do not edit integ files
  this phase.
- **Green** → Invoke the `tdd-green` subagent to make C1 pass. Expected:
  **no application source**. Re-run the C1 unit command. If RED, STOP —
  do not add a `createServiceClient` guard. Never edit tests/spec.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C1 and
  re-verify. Re-run C1 unit +
  `pnpm test:unit tests/unit/scheduling/hours-mutation-target.test.ts`.
  Exit: GREEN + lint + typecheck + prettier --check on touched tests.
  Return adversarial Residual findings, Suggested review order, Reusable
  pattern.

### Criterion C2 — PV-ISO marketing pin (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for
  C2. Work-order path + C2 / PV-ISO. New file:
  `tests/unit/marketing/review-email-schema-isolation.test.ts`. Name:
  `marketing integ suites call assertIsolatedHoursMutationTarget before mutating writes`.
  Glob `tests/integration/marketing/*.integ.test.ts`. Named import +
  zero-arg first-statement pin on every `beforeAll` / `beforeEach` /
  `afterEach` / `afterAll`. Do **not** edit the marketing integ file.
  Command:
  `pnpm test:unit tests/unit/marketing/review-email-schema-isolation.test.ts`.
  Exit: RED for missing import/call.
- **Red-wire** → Invoke the `tdd-red` subagent to wire
  `tests/integration/marketing/review-email-schema.integ.test.ts` only
  (import + first-statement zero-arg calls on every write hook in all
  three describes). Do not change payloads/dates/assertions. Re-run C2
  unit. Exit: GREEN.
- **Green** → Invoke the `tdd-green` subagent to make C2 pass. Expected:
  **no application source**. Same STOP if still RED.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C2 and
  re-verify. Re-run C2 unit. Exit: GREEN + lint + typecheck + prettier
  --check on touched tests. Return Residual findings, Suggested review
  order, Reusable pattern.

### Criterion C3 — ORD-ISO POS pin (layer: unit)

- **Red** → Invoke the `tdd-red` subagent to write the failing test for
  C3. Work-order path + C3 / ORD-ISO. New file:
  `tests/unit/pos/orders-persistence-isolation.test.ts`. Name:
  `POS integ suites call assertIsolatedHoursMutationTarget before mutating writes`.
  Glob `tests/integration/pos/*.integ.test.ts`. Named import + zero-arg
  first-statement pin on `beforeAll` and every `afterEach` / `afterAll`.
  Missing `beforeAll` is a failure. Do **not** edit the POS integ file.
  Command:
  `pnpm test:unit tests/unit/pos/orders-persistence-isolation.test.ts`.
  Exit: RED for missing import/call/`beforeAll`.
- **Red-wire** → Invoke the `tdd-red` subagent to wire
  `tests/integration/pos/orders-persistence.integ.test.ts` (import +
  `beforeAll` with first-statement pin + first-statement pin on
  `afterEach`). Do not change probe constants/assertions. Re-run C3 unit.
  Exit: GREEN.
- **Green** → Invoke the `tdd-green` subagent to make C3 pass. Expected:
  **no application source**. Same STOP if still RED.
- **Refactor** → Invoke the `tdd-refactor` subagent to clean up C3 and
  re-verify. Re-run C3 unit. Exit: GREEN + lint + typecheck + prettier
  --check on touched tests. Return Residual findings, Suggested review
  order, Reusable pattern.

## Manual-UAT (deferred, not automated)

- none

## Docs Sync

No `start-linear` (linear_issue: none).

Phase todos (one per phase):

- `c1-red` — Invoke the `tdd-red` subagent to write the failing test for C1
- `c1-red-wire` — Invoke the `tdd-red` subagent to apply the authorized existing-test edit for C1
- `c1-green` — Invoke the `tdd-green` subagent to make the C1 test pass
- `c1-refactor` — Invoke the `tdd-refactor` subagent to clean up C1 and re-verify
- `c2-red` — Invoke the `tdd-red` subagent to write the failing test for C2
- `c2-red-wire` — Invoke the `tdd-red` subagent to apply the authorized existing-test wiring for C2
- `c2-green` — Invoke the `tdd-green` subagent to make the C2 test pass
- `c2-refactor` — Invoke the `tdd-refactor` subagent to clean up C2 and re-verify
- `c3-red` — Invoke the `tdd-red` subagent to write the failing test for C3
- `c3-red-wire` — Invoke the `tdd-red` subagent to apply the authorized existing-test wiring for C3
- `c3-green` — Invoke the `tdd-green` subagent to make the C3 test pass
- `c3-refactor` — Invoke the `tdd-refactor` subagent to clean up C3 and re-verify

Close-out todos:

- `4d-review-trail` — Collate **Suggested Review Order (collated)** into
  `docs/verifier-reports/tdd/res_iso_followup_pins_b8e4c2a1.md`. INPUT:
  that log’s per-criterion Refactor sections. OUTPUT:
  `## Suggested Review Order (collated)`.
- `4e-traceability` — Finalize **Traceability (final)** + **Run metrics**
  in the same tdd log. Then
  `node .cursor/checks/harness-lint.mjs res_iso_followup_pins_b8e4c2a1`.
- `4-docs-packet` — Assemble the Docs sync packet in-thread.
- `4-docs-updater` — Invoke the `docs-updater` subagent with that packet
  (`run_in_background: true`); wait for its report before 4C.
- `4c-findings` — Merge INPUT
  `docs/findings/runs/res_iso_followup_pins_b8e4c2a1.md` into
  `docs/findings/<category>.md`. Remove the three High isolation lines
  from `docs/findings/test-debt.md` (resolved in-run) into `archive.md`.
  Cloud: persist leftover findings; STOP before net-new Linear issues.
- `4-format` — prettier --write this run’s dirty paths (never `.`). Then
  `/commit`.

```markdown
## Docs sync packet

- plan_slug: res_iso_followup_pins_b8e4c2a1
- spec: docs/specs/booking-rules.md; docs/specs/post-visit-review-email.md; docs/specs/menu-availability.md
- mode: FIX
- linear_issue: none
- criteria_shipped: [C1, C2, C3]
- criteria_manual_uat: none
- req_ids: [RES-ISO, PV-ISO, ORD-ISO]
- source_paths: []
- test_paths: [tests/unit/reservations/reservation-integ-isolation.test.ts, tests/unit/marketing/review-email-schema-isolation.test.ts, tests/unit/pos/orders-persistence-isolation.test.ts, tests/integration/marketing/review-email-schema.integ.test.ts, tests/integration/pos/orders-persistence.integ.test.ts]
- architecture_touch: none
- uat_flows_to_stamp: none
- patterns_to_promote: none
- traceability_log: docs/verifier-reports/tdd/res_iso_followup_pins_b8e4c2a1.md
- drift_flagged: none
- skip_reason: none
```

## Out-of-Scope Findings (the Findings Ledger — "none" if empty)

Already on the bus from RES-39 — do not re-file this run:

| Finding                                                         | Where (file:line/area)                                                         | Why it matters                                                  | Severity | Relation                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------- | -------------------------------------------------- |
| Scheduling OH-SAVE `afterAll` nests the pin inside `try`        | `tests/integration/scheduling/replace-operating-windows.integ.test.ts:113-119` | First-statement scan would fail this sibling                    | med      | below floor                                        |
| RES-ISO scan does not require a pin on reservation `beforeEach` | `tests/unit/reservations/reservation-integ-isolation.test.ts`                  | A new reservation integ that mutates in `beforeEach` would pass | med      | below floor; C2 covers marketing `beforeEach` only |
| Scan matches only identifier hooks / inline callbacks           | reservation-integ-isolation.test.ts                                            | `vitest.beforeAll` or `beforeAll(setup)` invisible              | low      | below floor                                        |
| Cleanup helpers themselves are unguarded                        | reservation integ cleanup helpers                                              | module-scope call would write without a pin                     | low      | below floor                                        |
| Isolation helper error is still hours-branded                   | `lib/scheduling/hours-mutation-target.ts:31`                                   | Reservation/POS/marketing throw still says “Hours mutation…”    | low      | tech-debt                                          |

## Linear Close-out & Findings Registration

- **START:** skip (`linear_issue: none`).
- **Close-out:** skip Linear resolution comment (no tracked issue).
- **Findings registration:** merge run file; archive the three High
  isolation lines as resolved-in-run; Cloud STOP before net-new issues
  for any new High leftovers.

## Suggested Review Order (review trail — assembled at close-out, Step 4D)

Placeholder — collated after Refactor phases.

- [security] zero-arg isolation scan
- [security] marketing integ pin-before-write
- [security] POS integ pin-before-write

## Retrospective (close-out, Step 4E — "none" if nothing reusable)

- Patterns for packet `patterns_to_promote`: none (pending Refactor)
- Traceability finalized: pending
- Run metrics: pending
- `node .cursor/checks/harness-lint.mjs res_iso_followup_pins_b8e4c2a1`: pending

## First Execution Action

- **Managed Cloud one-shot:** work-order is this file. Do not wait for a
  second accept. Arm `tdd-guard`. Skip START. Apply the three spec edits
  listed in `## Permissions Requested`. Then delegate C1 Red.
