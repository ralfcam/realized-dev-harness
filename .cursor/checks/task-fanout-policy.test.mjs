import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  RESERVATION_TTL_MS,
  TASK_FANOUT_INFLIGHT_CAP,
  inflightCount,
  onSubagentStart,
  onSubagentStop,
  onTaskFailure,
  pruneExpired,
  tryReserve,
} from "../hooks/lib/task-fanout-policy.mjs"

const hooks = JSON.parse(
  readFileSync(join(process.cwd(), ".cursor", "hooks.json"), "utf8"),
)

function hookByCommand(event, needle) {
  return (hooks.hooks[event] || []).find((h) => h.command.includes(needle))
}

const NOW = 1_000_000

function fillPending(n, ts = NOW) {
  return Array.from({ length: n }, () => ({ status: "pending", ts }))
}

test("task-fanout guard is fail-open on Task preToolUse with matcher Task", () => {
  const pre = hookByCommand("preToolUse", "task-fanout-guard.mjs")
  assert.ok(pre, "task-fanout-guard is registered on preToolUse")
  assert.equal(pre.failClosed, false)
  assert.equal(pre.matcher, "Task")
})

test("task-fanout guard decrements on Task postToolUseFailure and subagent start/stop", () => {
  const fail = hookByCommand("postToolUseFailure", "task-fanout-guard.mjs")
  const start = hookByCommand("subagentStart", "task-fanout-guard.mjs")
  const stop = hookByCommand("subagentStop", "task-fanout-guard.mjs")
  assert.ok(fail, "task-fanout-guard is registered on postToolUseFailure")
  assert.match(fail.command, /--failure/)
  assert.equal(fail.failClosed, false)
  assert.ok(start, "task-fanout-guard is registered on subagentStart")
  assert.match(start.command, /\bstart$/)
  assert.ok(stop, "task-fanout-guard is registered on subagentStop")
  assert.match(stop.command, /\bstop$/)
})

test("tryReserve allows up to the cap and denies the next", () => {
  const almost = fillPending(TASK_FANOUT_INFLIGHT_CAP - 1)
  const allowed = tryReserve(almost, NOW)
  assert.equal(allowed.deny, false)
  assert.equal(allowed.reservations.length, TASK_FANOUT_INFLIGHT_CAP)
  assert.equal(allowed.reservations.at(-1).status, "pending")

  const denied = tryReserve(allowed.reservations, NOW)
  assert.equal(denied.deny, true)
  assert.equal(denied.reservations.length, TASK_FANOUT_INFLIGHT_CAP)
})

test("converting pending to running does not free a slot", () => {
  let state = fillPending(TASK_FANOUT_INFLIGHT_CAP)
  for (let i = 0; i < TASK_FANOUT_INFLIGHT_CAP; i++)
    state = onSubagentStart(state, NOW)
  assert.equal(inflightCount(state, NOW), TASK_FANOUT_INFLIGHT_CAP)
  assert.ok(state.every((r) => r.status === "running"))
  assert.equal(tryReserve(state, NOW).deny, true)
})

test("subagentStop and Task failure free a slot", () => {
  const running = onSubagentStart(fillPending(TASK_FANOUT_INFLIGHT_CAP), NOW)
  const afterStop = onSubagentStop(running, NOW)
  assert.equal(afterStop.length, TASK_FANOUT_INFLIGHT_CAP - 1)
  assert.equal(tryReserve(afterStop, NOW).deny, false)

  const pending = fillPending(TASK_FANOUT_INFLIGHT_CAP)
  const afterFail = onTaskFailure(pending, NOW)
  assert.equal(afterFail.length, TASK_FANOUT_INFLIGHT_CAP - 1)
  assert.equal(tryReserve(afterFail, NOW).deny, false)
})

test("TTL prune drops stale reservations so a new Task is allowed", () => {
  const stale = fillPending(TASK_FANOUT_INFLIGHT_CAP, NOW - RESERVATION_TTL_MS)
  assert.equal(pruneExpired(stale, NOW).length, 0)
  const allowed = tryReserve(stale, NOW)
  assert.equal(allowed.deny, false)
  assert.equal(allowed.reservations.length, 1)

  const fresh = fillPending(
    TASK_FANOUT_INFLIGHT_CAP,
    NOW - RESERVATION_TTL_MS + 1,
  )
  assert.equal(tryReserve(fresh, NOW).deny, true)
})
