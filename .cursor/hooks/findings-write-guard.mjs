#!/usr/bin/env node
/**
 * preToolUse (matcher Write): deny parent Writes under docs/findings/
 * unless findings-writer.json is { "allowed": true }.
 *
 * subagentStart (matcher docs-updater): set the allow flag.
 *   node .cursor/hooks/findings-write-guard.mjs start
 * subagentStop (matcher docs-updater): clear the allow flag.
 *   node .cursor/hooks/findings-write-guard.mjs stop
 *
 * linear-resolver never writes local files; feedback-validator is read-only
 * — they must not set the flag (hooks.json matchers are docs-updater only).
 *
 * Residual: a parent Shell redirect into docs/findings/ still bypasses,
 * same class as other Write-only guards. While a docs-updater Task is in
 * flight, a concurrent parent Write to findings would also pass.
 *
 * Fails OPEN (failClosed: false in hooks.json): any error returns {} so a
 * crashing hook never bricks every Write. Payload shapes and the liveness
 * standard: .cursor/rules/hook-authoring.mdc.
 */
import {
  extractPath,
  readStdinJson,
  writeStdoutJson,
} from "./lib/tdd-guard-policy.mjs"
import { checkFindingsWrite, setAllowed } from "./lib/findings-write-policy.mjs"

function main() {
  try {
    const input = readStdinJson()
    const action = process.argv[2]
    if (action === "start") {
      setAllowed(true)
      writeStdoutJson({})
      return
    }
    if (action === "stop") {
      setAllowed(false)
      writeStdoutJson({})
      return
    }
    if (input.tool_name !== "Write") {
      writeStdoutJson({})
      return
    }
    const path = extractPath(input.tool_input)
    const hit = checkFindingsWrite(path)
    if (!hit) {
      writeStdoutJson({})
      return
    }
    writeStdoutJson({
      permission: "deny",
      user_message: `Blocked a parent edit to "${path}" — docs/findings/** is docs-updater-only.`,
      agent_message:
        `findings-write guard: "${path}" is under docs/findings/. The parent orchestrator ` +
        "must not Write the ledger. Delegate via the Task tool to docs-updater (which sets " +
        "the allow flag on subagentStart). Residual: a parent Shell redirect into " +
        "docs/findings/ still bypasses, same class as other Write-only guards.",
    })
  } catch (err) {
    console.error("[findings-write-guard]", err)
    writeStdoutJson({})
  }
}

main()
