#!/usr/bin/env node
/**
 * beforeMCPExecution: always-on interlock against Linear Cloud Agent spawn.
 *
 * Denies Linear MCP calls that open any of the three spawn doors
 * (save_issue.assignee including null, save_issue.delegate, or an @Cursor
 * mention in a comment / title / description / status update / patch op). See
 * .cursor/hooks/lib/linear-spawn-policy.mjs and
 * .cursor/rules/linear-automation.mdc.
 *
 * Always-on — not gated on isArmed(). Fail-open (failClosed: false in
 * hooks.json) is deliberate: a crashing failClosed hook on this matcher
 * would brick every MCP call and take /triage, /capture, and
 * linear-resolver down with it. git-stage-guard remains the only
 * failClosed Shell hook.
 *
 * Local-only: Cursor's MCP hook events are unavailable in cloud agents,
 * so a cloud agent with Linear MCP access is still restrained by prose.
 *
 * Registered on beforeMCPExecution (not preToolUse CallMcpTool): Cursor
 * delivers MCP calls as tool_name=<mcp tool>, tool_input as a JSON string,
 * mcp_server_name/command as the server key. A CallMcpTool matcher never
 * fires. Payload shapes and the liveness standard:
 * .cursor/rules/hook-authoring.mdc.
 */
import {
  readStdinJson,
  writeStdoutJson,
  extractMcpCall,
} from "./lib/mcp-payload.mjs"
import { detectLinearSpawn } from "./lib/linear-spawn-policy.mjs"

function main() {
  try {
    const input = readStdinJson()
    const extracted = extractMcpCall(input)
    if (!extracted) {
      writeStdoutJson({})
      return
    }

    const hit = detectLinearSpawn(
      extracted.server,
      extracted.toolName,
      extracted.args,
    )
    if (hit) {
      writeStdoutJson({
        permission: "deny",
        user_message:
          "Blocked a Linear MCP call that would spawn a Cursor Cloud Agent.",
        agent_message:
          `linear-spawn guard: ${extracted.toolName} ${hit.field} is a Cloud Agent spawn door (${hit.kind}). ` +
          "Do not set save_issue.assignee (including null) or save_issue.delegate, and do not write " +
          "@Cursor in comments, titles, descriptions, status updates, or patch ops — Linear parses " +
          'the mention regardless of surrounding prose. Rephrase to "the Cursor integration". See ' +
          ".cursor/rules/linear-automation.mdc.",
      })
      return
    }

    writeStdoutJson({})
  } catch (err) {
    console.error("[linear-spawn-guard]", err)
    writeStdoutJson({})
  }
}

main()
