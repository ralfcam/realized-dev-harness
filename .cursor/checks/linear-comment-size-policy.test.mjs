import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  detectOversizedComment,
  START_SUMMARY_MAX_CHARS,
} from "../hooks/lib/linear-comment-size-policy.mjs"

const hooks = JSON.parse(
  readFileSync(join(process.cwd(), ".cursor", "hooks.json"), "utf8"),
)
const LINEAR = "plugin-linear-linear"
const VERCEL = "plugin-vercel-vercel"

function hookByCommand(event, needle) {
  return (hooks.hooks[event] || []).find((h) => h.command.includes(needle))
}

test("linear-comment-size-guard is registered on beforeMCPExecution, fail-open", () => {
  const hook = hookByCommand(
    "beforeMCPExecution",
    "linear-comment-size-guard.mjs",
  )
  assert.ok(
    hook,
    "linear-comment-size-guard is registered on beforeMCPExecution",
  )
  assert.equal(hook.failClosed, false)
})

test("linear-comment-size-guard.mjs wires detectOversizedComment", () => {
  const src = readFileSync(
    join(process.cwd(), ".cursor", "hooks", "linear-comment-size-guard.mjs"),
    "utf8",
  )
  assert.match(src, /detectOversizedComment/)
})

test("detectOversizedComment allows a body at exactly the budget", () => {
  const body = "a".repeat(START_SUMMARY_MAX_CHARS)
  assert.equal(detectOversizedComment(LINEAR, "save_comment", { body }), null)
})

test("detectOversizedComment denies a body one character over the budget", () => {
  const body = "a".repeat(START_SUMMARY_MAX_CHARS + 1)
  const hit = detectOversizedComment(LINEAR, "save_comment", { body })
  assert.equal(hit.length, START_SUMMARY_MAX_CHARS + 1)
  assert.equal(hit.max, START_SUMMARY_MAX_CHARS)
})

test("detectOversizedComment allows an ordinary short comment", () => {
  assert.equal(
    detectOversizedComment(LINEAR, "save_comment", {
      body: "Work started: plan foo",
    }),
    null,
  )
})

test("CLARIFY comments use the shared save_comment budget", () => {
  const prefix =
    "Clarification required\nKey: clarify:RES-42:booking-rules:BW-9\n"
  const body = `${prefix}${"a".repeat(START_SUMMARY_MAX_CHARS)}`
  const hit = detectOversizedComment(LINEAR, "save_comment", { body })
  assert.equal(hit.length, body.length)
  assert.equal(hit.max, START_SUMMARY_MAX_CHARS)
})

test("detectOversizedComment is scoped to save_comment (save_issue is out of scope)", () => {
  const body = "a".repeat(START_SUMMARY_MAX_CHARS + 1)
  assert.equal(
    detectOversizedComment(LINEAR, "save_issue", { description: body }),
    null,
  )
})

test("detectOversizedComment ignores a non-string body", () => {
  assert.equal(
    detectOversizedComment(LINEAR, "save_comment", { body: null }),
    null,
  )
  assert.equal(detectOversizedComment(LINEAR, "save_comment", {}), null)
})

test("detectOversizedComment allows the same oversized body on a non-Linear server", () => {
  const body = "a".repeat(START_SUMMARY_MAX_CHARS + 1)
  assert.equal(detectOversizedComment(VERCEL, "save_comment", { body }), null)
})

function runSizeGuard(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      join(process.cwd(), ".cursor", "hooks", "linear-comment-size-guard.mjs"),
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

test("linear-comment-size-guard denies an oversized body from a BOM-prefixed beforeMCPExecution payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "save_comment",
      tool_input: JSON.stringify({
        id: "RES-1386",
        body: "a".repeat(START_SUMMARY_MAX_CHARS + 1),
      }),
      mcp_server_name: "linear",
      command: "linear",
      hook_event_name: "beforeMCPExecution",
    })
  const { code, out } = await runSizeGuard(payload)
  assert.equal(code, 0)
  const parsed = JSON.parse(out)
  assert.equal(parsed.permission, "deny")
  assert.match(parsed.agent_message, /START_SUMMARY_MAX_CHARS/)
})

test("linear-comment-size-guard allows an in-budget body from a BOM-prefixed beforeMCPExecution payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "save_comment",
      tool_input: JSON.stringify({
        id: "RES-1386",
        body: "Work started: plan foo",
      }),
      mcp_server_name: "linear",
      command: "linear",
      hook_event_name: "beforeMCPExecution",
    })
  const { code, out } = await runSizeGuard(payload)
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(out), {})
})
