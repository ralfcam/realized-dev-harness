#!/usr/bin/env node
/**
 * Task fan-out cap (see .cursor/rules/task-fanout.mdc).
 *
 * preToolUse (matcher Task): reserve a pending slot or deny when in-flight
 * is at TASK_FANOUT_INFLIGHT_CAP.
 *   node .cursor/hooks/task-fanout-guard.mjs
 * subagentStart: convert pending → running (total unchanged).
 *   node .cursor/hooks/task-fanout-guard.mjs start
 * subagentStop: release one running slot.
 *   node .cursor/hooks/task-fanout-guard.mjs stop
 * postToolUseFailure (Task): release the pending spawn that never started.
 *   node .cursor/hooks/task-fanout-guard.mjs --failure
 *
 * Fails OPEN (failClosed: false): any error returns {} so TDD Task calls are
 * never bricked by this hook.
 */
import {
  TASK_FANOUT_INFLIGHT_CAP,
  isTaskTool,
  loadReservations,
  onSubagentStart,
  onSubagentStop,
  onTaskFailure,
  readStdinJson,
  saveReservations,
  tryReserve,
  writeStdoutJson,
} from "./lib/task-fanout-policy.mjs"

const DENY = {
  permission: "deny",
  user_message: `Blocked a Task launch — ${TASK_FANOUT_INFLIGHT_CAP} Tasks already in flight. Wave remaining work.`,
  agent_message:
    `task-fanout guard: in-flight Task reservations are at TASK_FANOUT_INFLIGHT_CAP ` +
    `(${TASK_FANOUT_INFLIGHT_CAP}). Wave remaining work; wait for in-flight to drop. ` +
    "See .cursor/rules/task-fanout.mdc. Do not retry denied items in this turn; " +
    "do not serialize to one-at-a-time.",
}

function persist(next) {
  saveReservations(next)
  return next
}

function main() {
  try {
    const input = readStdinJson()
    const argv = process.argv.slice(2)
    const failure = argv.includes("--failure")
    const action = argv.find((a) => a === "start" || a === "stop")

    if (action === "start") {
      persist(onSubagentStart(loadReservations()))
      writeStdoutJson({})
      return
    }
    if (action === "stop") {
      persist(onSubagentStop(loadReservations()))
      writeStdoutJson({})
      return
    }
    if (failure) {
      if (isTaskTool(input.tool_name))
        persist(onTaskFailure(loadReservations()))
      writeStdoutJson({})
      return
    }

    if (!isTaskTool(input.tool_name)) {
      writeStdoutJson({})
      return
    }

    const result = tryReserve(loadReservations())
    persist(result.reservations)
    if (result.deny) {
      writeStdoutJson(DENY)
      return
    }
    writeStdoutJson({})
  } catch (err) {
    console.error("[task-fanout-guard]", err)
    writeStdoutJson({})
  }
}

main()
