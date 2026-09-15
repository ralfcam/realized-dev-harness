#!/usr/bin/env node
/**
 * beforeMCPExecution: always-on interlock against oversized Linear comments.
 *
 * Denies a Linear save_comment whose body exceeds START_SUMMARY_MAX_CHARS
 * (see .cursor/hooks/lib/linear-comment-size-policy.mjs). This is the
 * mechanical stop the five plan-body incidents lacked: harness-lint L5 is a
 * doctrine anchor checked at rest, not a live Linear probe, so it never
 * caught an oversized call in flight.
 *
 * Always-on — not gated on isArmed(). Fail-open (failClosed: false in
 * hooks.json) for the same reason as linear-spawn-guard: a crashing
 * failClosed hook on this matcher would brick every MCP call and take
 * /triage, /capture, and linear-resolver down with it.
 *
 * Local-only: Cursor's MCP hook events are unavailable in cloud agents.
 *
 * Registered on beforeMCPExecution (not preToolUse CallMcpTool): Cursor
 * delivers MCP calls as tool_name=<mcp tool>, tool_input as a JSON string,
 * mcp_server_name/command as the server key. Payload shapes and the
 * liveness standard: .cursor/rules/hook-authoring.mdc.
 */
import {
  readStdinJson,
  writeStdoutJson,
  extractMcpCall,
} from "./lib/mcp-payload.mjs"
import { detectOversizedComment } from "./lib/linear-comment-size-policy.mjs"

function main() {
  try {
    const input = readStdinJson()
    const extracted = extractMcpCall(input)
    if (!extracted) {
      writeStdoutJson({})
      return
    }

    const hit = detectOversizedComment(
      extracted.server,
      extracted.toolName,
      extracted.args,
    )
    if (hit) {
      writeStdoutJson({
        permission: "deny",
        user_message: `Blocked an oversized Linear comment (${hit.length} chars, max ${hit.max}).`,
        agent_message:
          `linear-comment-size guard: save_comment.body is ${hit.length} characters, over the ` +
          `${hit.max}-character START_SUMMARY_MAX_CHARS budget. Trim to the bounded ` +
          "## Linear Plan Digest summary — never chunk across multiple comments, never build the " +
          "MCP payload via Shell, and never spawn a nested Task to post the plan file. See " +
          ".cursor/hooks/lib/linear-comment-size-policy.mjs.",
      })
      return
    }

    writeStdoutJson({})
  } catch (err) {
    console.error("[linear-comment-size-guard]", err)
    writeStdoutJson({})
  }
}

main()
