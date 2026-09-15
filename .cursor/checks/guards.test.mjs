import assert from "node:assert/strict"
import { test } from "node:test"
import {
  checkTddWrite,
  detectBlanketGitStage,
  detectGhPrMerge,
} from "../hooks/lib/tdd-guard-policy.mjs"
import {
  TASK_FANOUT_INFLIGHT_CAP,
  tryReserve,
} from "../hooks/lib/task-fanout-policy.mjs"
import { linearWriteVerdict } from "../hooks/lib/linear-mirror-policy.mjs"

test("git safety rejects blanket staging and agent merges", () => {
  assert.equal(detectBlanketGitStage("git add -A").kind, "add")
  assert.equal(detectBlanketGitStage("git add app/page.tsx"), null)
  assert.equal(detectGhPrMerge("gh pr merge 10").kind, "pr-merge")
})

test("TDD phases enforce exclusive write scopes", () => {
  assert.equal(checkTddWrite("app/page.tsx", { depth: 1, phase: "red" }).kind, "phase-red")
  assert.equal(checkTddWrite("tests/page.test.ts", { depth: 1, phase: "green" }).kind, "phase-tests")
  assert.equal(checkTddWrite("tests/page.test.ts", { depth: 1, phase: "red" }), null)
})

test("task fan-out stops at the configured cap", () => {
  let reservations = []
  for (let i = 0; i < TASK_FANOUT_INFLIGHT_CAP; i += 1) {
    const result = tryReserve(reservations, 1000)
    assert.equal(result.deny, false)
    reservations = result.reservations
  }
  assert.equal(tryReserve(reservations, 1000).deny, true)
})

test("Linear writes require both profile enablement and resolver ownership", () => {
  const request = { server: "plugin-linear", tool: "save_issue" }
  assert.equal(
    linearWriteVerdict({ ...request, enabled: false, resolverActive: true }).reason,
    "profile_disabled",
  )
  assert.equal(
    linearWriteVerdict({ ...request, enabled: true, resolverActive: false }).reason,
    "resolver_only",
  )
  assert.equal(
    linearWriteVerdict({ ...request, enabled: true, resolverActive: true }).allow,
    true,
  )
})
