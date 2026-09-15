#!/usr/bin/env node
/**
 * beforeMCPExecution: deny parent Linear save_issue / save_comment /
 * save_status_update unless linear-writer.json is { "allowed": true }.
 *
 * subagentStart (matcher linear-resolver): set the allow flag.
 *   node .cursor/hooks/linear-write-guard.mjs start
 * subagentStop (matcher linear-resolver): clear the allow flag.
 *   node .cursor/hooks/linear-write-guard.mjs stop
 *
 * list_* / get_* reads stay unrestricted (triage PHASE 0). docs-updater
 * and feedback-validator must not set this flag (hooks.json matcher is
 * linear-resolver only).
 *
 * Fails OPEN (failClosed: false in hooks.json): a crashing failClosed hook
 * on this matcher would brick every MCP call. Payload shapes and the
 * liveness standard: .cursor/rules/hook-authoring.mdc.
 *
 * New beforeMCPExecution entries do not hot-reload mid-session — live
 * denial needs a Cursor window reload. Spawn-level tests are the logic
 * proof until then.
 */
import {
  readStdinJson,
  writeStdoutJson,
  extractMcpCall,
} from "./lib/mcp-payload.mjs"
import { checkLinearWrite, setAllowed } from "./lib/linear-write-policy.mjs"

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

    const extracted = extractMcpCall(input)
    if (!extracted) {
      writeStdoutJson({})
      return
    }

    const hit = checkLinearWrite(extracted.server, extracted.toolName)
    if (!hit) {
      writeStdoutJson({})
      return
    }

    writeStdoutJson({
      permission: "deny",
      user_message: `Blocked a parent Linear ${extracted.toolName} — writes are linear-resolver-only.`,
      agent_message:
        `linear-write guard: ${extracted.toolName} mutates Linear. The parent orchestrator ` +
        "must not call save_issue, save_comment, or save_status_update. Delegate via " +
        "the Task tool to linear-resolver (which sets the allow flag on " +
        "subagentStart). Reads (list_*, get_*) stay unrestricted. See " +
        ".cursor/agents/linear-resolver.md.",
    })
  } catch (err) {
    console.error("[linear-write-guard]", err)
    writeStdoutJson({})
  }
}

main()
