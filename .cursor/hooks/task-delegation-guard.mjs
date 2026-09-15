#!/usr/bin/env node
/**
 * preToolUse (matcher Task): always-on interlock against two Task-delegation
 * hazards (see .cursor/hooks/lib/task-delegation-policy.mjs):
 *
 *   1. `model` passed on a Task whose `subagent_type` has a `model:` pin in
 *      its .cursor/agents/<type>.md frontmatter.
 *   2. A `generalPurpose` Task whose prompt instructs a Linear MCP write.
 *
 * Split out from tdd-delegation-guard.mjs rather than overloaded onto it —
 * that hook only handles write tools (Write/StrReplace/etc.), this one
 * handles Task — same precedent as git-stage-guard.mjs being split out of
 * tdd-delegation-guard.mjs (see tdd-delegation-guard.mjs:3).
 *
 * Always-on — not gated on isArmed(). This is a general Task-hygiene rule,
 * not an sdd-to-tdd-only guard.
 *
 * Fails OPEN (failClosed: false in hooks.json): any error returns {} so a
 * crashing hook never blocks every Task launch. Payload shapes and the
 * liveness standard: .cursor/rules/hook-authoring.mdc.
 */
import {
  readStdinJson,
  writeStdoutJson,
  checkTaskDelegation,
} from "./lib/task-delegation-policy.mjs"

const MESSAGES = {
  "model-override": (subagentType, pinned) => ({
    user_message: `Blocked a Task launch — "${subagentType}" pins model "${pinned}"; do not override it.`,
    agent_message:
      `task-delegation guard: subagent_type "${subagentType}" pins model "${pinned}" in ` +
      `.cursor/agents/${subagentType}.md frontmatter. Never pass model on this Task — drop the ` +
      "model argument and let the pin apply.",
  }),
  "generalPurpose-linear-write": () => ({
    user_message:
      "Blocked a generalPurpose Task instructing a Linear MCP write.",
    agent_message:
      "task-delegation guard: this generalPurpose Task's prompt instructs a Linear MCP write " +
      "(save_comment / save_issue / save_document / plugin-linear-linear). generalPurpose has never " +
      "read linear-resolver's size/spawn limits — delegate Linear writes to the linear-resolver " +
      "subagent instead.",
  }),
}

function main() {
  try {
    const input = readStdinJson()
    if (input.tool_name !== "Task") {
      writeStdoutJson({})
      return
    }
    const ti =
      input.tool_input && typeof input.tool_input === "object"
        ? input.tool_input
        : {}
    const hit = checkTaskDelegation({
      subagentType: ti.subagent_type,
      model: ti.model,
      prompt: ti.prompt,
    })
    if (!hit) {
      writeStdoutJson({})
      return
    }
    const msgs = MESSAGES[hit.kind](ti.subagent_type, hit.pinned)
    writeStdoutJson({ permission: "deny", ...msgs })
  } catch (err) {
    console.error("[task-delegation-guard]", err)
    writeStdoutJson({})
  }
}

main()
