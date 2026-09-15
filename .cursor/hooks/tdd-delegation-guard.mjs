#!/usr/bin/env node
/**
 * preToolUse: two independent, additive guards (git-stage lives in
 * git-stage-guard.mjs so it can failClosed without bricking edits).
 *
 * 1. Spec-write guard (while ARMED and a TDD phase is set): tdd-* subagents
 *    may never write under docs/specs/** (and docs/ADR/**). The parent
 *    approved spec edit is legal while phase is null, including while
 *    background START has depth > 0.
 * 2. Delegation + phase guard (while ARMED): blocks the orchestrator from
 *    editing implementation/test files directly (depth === 0). When a
 *    subagent is running (depth > 0) and a phase is set, also enforces the
 *    phase's write scope: red → tests/ only; green/refactor → tests/ blocked.
 *
 * Fails OPEN (failClosed: false in hooks.json): any error or unarmed/no-match
 * state returns no opinion ({}) so normal editing is never bricked by this
 * hook. A missed TDD block is worse than freezing every Write. Payload
 * shapes and the liveness standard: .cursor/rules/hook-authoring.mdc.
 */
import {
  readStdinJson,
  writeStdoutJson,
  isArmed,
  getDepth,
  getPhase,
  isWriteTool,
  extractPath,
  checkTddWrite,
} from "./lib/tdd-guard-policy.mjs"

const MESSAGES = {
  spec: (path) => ({
    user_message: `Blocked a subagent edit to "${path}" — docs/specs/** and docs/ADR/** are read-only for subagents.`,
    agent_message:
      `spec-write guard: "${path}" is under docs/specs/** or docs/ADR/**, which only the parent ` +
      "orchestrator may edit (the operator-approved spec change). Subagents (tdd-red/green/" +
      "refactor, verifiers) must treat specs as read-only context — report a spec↔code " +
      "mismatch instead of editing the spec.",
  }),
  "phase-red": (path) => ({
    user_message: `Blocked a Red-phase edit to "${path}" — Red may only write under tests/.`,
    agent_message:
      `phase guard: the active phase is "red", which may only create/edit files under ` +
      `tests/**. "${path}" is outside that scope — if the test cannot compile without a ` +
      "source stub, STOP and report it for the Green phase instead of writing it here.",
  }),
  "phase-tests": (path, phase) => ({
    user_message: `Blocked a ${phase}-phase edit to "${path}" — ${phase} may not edit tests/.`,
    agent_message:
      `phase guard: the active phase is "${phase}", which must never edit files under ` +
      `tests/**. "${path}" is a test file — if it looks wrong, STOP and report it rather ` +
      "than changing it here.",
  }),
  delegation: (path) => ({
    user_message: `Blocked a direct orchestrator edit to "${path}" during sdd-to-tdd — delegation to a tdd-* subagent is required.`,
    agent_message:
      `sdd-to-tdd delegation guard: you must NOT edit "${path}" directly. ` +
      "Delegate via the Task tool: tdd-red (tests), tdd-green (source), or " +
      "tdd-refactor (cleanup). If a phase is already underway, ensure it runs " +
      "as a subagent rather than inline.",
  }),
}

function main() {
  try {
    const input = readStdinJson()

    if (!isArmed()) {
      writeStdoutJson({})
      return
    }

    if (!isWriteTool(input.tool_name)) {
      writeStdoutJson({})
      return
    }

    const path = extractPath(input.tool_input)
    const phase = getPhase()
    const hit = checkTddWrite(path, { depth: getDepth(), phase })
    if (!hit) {
      writeStdoutJson({})
      return
    }

    const msgs = MESSAGES[hit.kind](path, phase)
    writeStdoutJson({ permission: "deny", ...msgs })
  } catch (err) {
    console.error("[tdd-delegation-guard]", err)
    writeStdoutJson({})
  }
}

main()
