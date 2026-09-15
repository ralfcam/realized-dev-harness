#!/usr/bin/env node
/**
 * subagentStart / subagentStop: maintain a depth counter so the delegation
 * guard knows whether a subagent (tdd-red/green/refactor, etc.) is currently
 * running. Used as:
 *   node .cursor/hooks/tdd-guard-depth.mjs start   (subagentStart)
 *   node .cursor/hooks/tdd-guard-depth.mjs stop    (subagentStop)
 *
 * No-ops unless the guard is armed. Always returns {} (never blocks a subagent).
 */
import {
  readStdinJson,
  writeStdoutJson,
  incDepth,
  decDepth,
} from "./lib/tdd-guard-policy.mjs"

function main() {
  try {
    readStdinJson() // consume stdin payload (unused)
    const action = process.argv[2]
    if (action === "start") incDepth()
    else if (action === "stop") decDepth()
  } catch (err) {
    console.error("[tdd-guard-depth]", err)
  }
  writeStdoutJson({})
}

main()
