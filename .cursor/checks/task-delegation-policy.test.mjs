import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  getPinnedModel,
  detectModelOverride,
  detectGeneralPurposeLinearWrite,
  checkTaskDelegation,
} from "../hooks/lib/task-delegation-policy.mjs"

const hooks = JSON.parse(
  readFileSync(join(process.cwd(), ".cursor", "hooks.json"), "utf8"),
)

function hookByCommand(event, needle) {
  return (hooks.hooks[event] || []).find((h) => h.command.includes(needle))
}

test("task-delegation-guard is registered on preToolUse Task, fail-open", () => {
  const hook = hookByCommand("preToolUse", "task-delegation-guard.mjs")
  assert.ok(hook, "task-delegation-guard is registered on preToolUse")
  assert.equal(hook.matcher, "Task")
  assert.equal(hook.failClosed, false)
})

test("task-delegation-guard.mjs wires checkTaskDelegation", () => {
  const src = readFileSync(
    join(process.cwd(), ".cursor", "hooks", "task-delegation-guard.mjs"),
    "utf8",
  )
  assert.match(src, /checkTaskDelegation/)
})

test("getPinnedModel reads a real pinned frontmatter (linear-resolver)", () => {
  const pinned = getPinnedModel("linear-resolver")
  assert.ok(pinned, "linear-resolver.md pins a model")
})

test("getPinnedModel returns null for a subagent type with no frontmatter model pin", () => {
  assert.equal(getPinnedModel("explore"), null)
})

test("getPinnedModel returns null for an unknown subagent type", () => {
  assert.equal(getPinnedModel("does-not-exist"), null)
})

test("detectModelOverride denies model passed on a pinned subagent type", () => {
  const hit = detectModelOverride(
    "linear-resolver",
    "claude-opus-5-thinking-high",
  )
  assert.equal(hit.kind, "model-override")
  assert.equal(hit.pinned, getPinnedModel("linear-resolver"))
})

test("detectModelOverride allows omitting model on a pinned subagent type", () => {
  assert.equal(detectModelOverride("linear-resolver", undefined), null)
})

test("detectModelOverride allows model on a subagent type with no pin", () => {
  assert.equal(
    detectModelOverride("explore", "claude-opus-5-thinking-high"),
    null,
  )
})

test("detectGeneralPurposeLinearWrite denies a generalPurpose prompt instructing save_comment", () => {
  const hit = detectGeneralPurposeLinearWrite(
    "generalPurpose",
    "Post this via save_comment on RES-1386",
  )
  assert.equal(hit.kind, "generalPurpose-linear-write")
})

test("detectGeneralPurposeLinearWrite denies a generalPurpose prompt referencing the Linear MCP server directly", () => {
  const hit = detectGeneralPurposeLinearWrite(
    "generalPurpose",
    "Call plugin-linear-linear to upload the plan",
  )
  assert.equal(hit.kind, "generalPurpose-linear-write")
})

test("CLARIFY save_comment cannot be delegated to generalPurpose", () => {
  const hit = detectGeneralPurposeLinearWrite(
    "generalPurpose",
    "Post the Clarification required body with save_comment on RES-42",
  )
  assert.equal(hit.kind, "generalPurpose-linear-write")
  assert.equal(
    detectGeneralPurposeLinearWrite(
      "linear-resolver",
      "Request the approved CLARIFY comment on RES-42",
    ),
    null,
  )
})

test("detectGeneralPurposeLinearWrite allows an ordinary generalPurpose prompt", () => {
  assert.equal(
    detectGeneralPurposeLinearWrite(
      "generalPurpose",
      "Summarize the auth module for me",
    ),
    null,
  )
})

test("detectGeneralPurposeLinearWrite allows a Linear-write prompt on a non-generalPurpose type", () => {
  assert.equal(
    detectGeneralPurposeLinearWrite(
      "linear-resolver",
      "Post this via save_comment",
    ),
    null,
  )
})

test("checkTaskDelegation prefers the model-override hit when both conditions are present", () => {
  const hit = checkTaskDelegation({
    subagentType: "linear-resolver",
    model: "claude-opus-5-thinking-high",
    prompt: "save_comment please",
  })
  assert.equal(hit.kind, "model-override")
})

test("checkTaskDelegation returns null for a clean generalPurpose Task", () => {
  assert.equal(
    checkTaskDelegation({
      subagentType: "generalPurpose",
      model: undefined,
      prompt: "Explore the repo",
    }),
    null,
  )
})

function runTaskGuard(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      join(process.cwd(), ".cursor", "hooks", "task-delegation-guard.mjs"),
    ])
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => {
      out += d
    })
    child.stderr.on("data", (d) => {
      err += d
    })
    child.on("close", (code) => {
      resolve({ code, out, err })
    })
    child.on("error", reject)
    child.stdin.end(payload)
  })
}

test("task-delegation-guard denies a model override from a BOM-prefixed preToolUse Task payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "Task",
      tool_input: {
        subagent_type: "linear-resolver",
        model: "claude-opus-5-thinking-high",
        prompt: "Start work on RES-1386",
      },
      hook_event_name: "preToolUse",
    })
  const { code, out } = await runTaskGuard(payload)
  assert.equal(code, 0)
  const parsed = JSON.parse(out)
  assert.equal(parsed.permission, "deny")
  assert.match(parsed.agent_message, /pins model/)
})

test("task-delegation-guard denies a generalPurpose Linear-write prompt from a BOM-prefixed payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "Task",
      tool_input: {
        subagent_type: "generalPurpose",
        prompt: "Upload the plan body via save_comment on RES-1386",
      },
      hook_event_name: "preToolUse",
    })
  const { code, out } = await runTaskGuard(payload)
  assert.equal(code, 0)
  const parsed = JSON.parse(out)
  assert.equal(parsed.permission, "deny")
  assert.match(parsed.agent_message, /generalPurpose/)
})

test("task-delegation-guard allows a clean Task from a BOM-prefixed payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "Task",
      tool_input: { subagent_type: "explore", prompt: "Find the auth module" },
      hook_event_name: "preToolUse",
    })
  const { code, out } = await runTaskGuard(payload)
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(out), {})
})

test("task-delegation-guard ignores non-Task tools from a BOM-prefixed payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "Shell",
      tool_input: { command: "ls" },
      hook_event_name: "preToolUse",
    })
  const { code, out } = await runTaskGuard(payload)
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(out), {})
})
