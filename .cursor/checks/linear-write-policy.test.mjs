import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, describe, test } from "node:test"
import {
  checkLinearWrite,
  isAllowed,
  isLinearWriteTool,
  setAllowed,
} from "../hooks/lib/linear-write-policy.mjs"

const hooks = JSON.parse(
  readFileSync(join(process.cwd(), ".cursor", "hooks.json"), "utf8"),
)
const LINEAR_STATE = join(
  process.cwd(),
  ".cursor",
  "hooks",
  "state",
  "linear-writer.json",
)
const LINEAR = "plugin-linear-linear"
const SAVE_ISSUE =
  "\uFEFF" +
  JSON.stringify({
    tool_name: "save_issue",
    tool_input: JSON.stringify({ title: "probe" }),
    mcp_server_name: LINEAR,
    hook_event_name: "beforeMCPExecution",
  })
const LIST_ISSUES =
  "\uFEFF" +
  JSON.stringify({
    tool_name: "list_issues",
    tool_input: JSON.stringify({ project: "V-1.2", limit: 10 }),
    mcp_server_name: LINEAR,
    hook_event_name: "beforeMCPExecution",
  })
const SAVE_STATUS_UPDATE =
  "\uFEFF" +
  JSON.stringify({
    tool_name: "save_status_update",
    tool_input: JSON.stringify({
      type: "project",
      project: "V-1.2",
      body: "Audit run key: audit:2026-09-11:abc123:scope=complete:project=none:issues=none",
      health: "onTrack",
    }),
    mcp_server_name: LINEAR,
    hook_event_name: "beforeMCPExecution",
  })
const SAVE_CLARIFICATION =
  "\uFEFF" +
  JSON.stringify({
    tool_name: "save_comment",
    tool_input: JSON.stringify({
      issue: "RES-42",
      body: [
        "Clarification required",
        "Key: clarify:RES-42:booking-rules:BW-9",
        "Decision question: Keep the existing contract?",
      ].join("\n"),
    }),
    mcp_server_name: LINEAR,
    hook_event_name: "beforeMCPExecution",
  })

function hookByCommand(event, needle) {
  return (hooks.hooks[event] || []).find((h) => h.command.includes(needle))
}

function runGuard(payload, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      join(process.cwd(), ".cursor", "hooks", "linear-write-guard.mjs"),
      ...extraArgs,
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

test("linear-write-guard is fail-open beforeMCPExecution; linear-resolver start/stop set the flag", () => {
  const mcp = hookByCommand("beforeMCPExecution", "linear-write-guard.mjs")
  assert.ok(mcp, "linear-write-guard is registered on beforeMCPExecution")
  assert.equal(mcp.failClosed, false)
  const start = hookByCommand("subagentStart", "linear-write-guard.mjs")
  assert.ok(start, "linear-write-guard start is registered")
  assert.equal(start.matcher, "linear-resolver")
  assert.match(start.command, /\bstart\b/)
  const stop = hookByCommand("subagentStop", "linear-write-guard.mjs")
  assert.ok(stop, "linear-write-guard stop is registered")
  assert.equal(stop.matcher, "linear-resolver")
  assert.match(stop.command, /\bstop\b/)
  for (const event of ["subagentStart", "subagentStop"]) {
    const wrongArm = (hooks.hooks[event] || []).filter(
      (h) =>
        h.command.includes("linear-write-guard.mjs") &&
        /docs-updater|feedback-validator/.test(h.matcher || ""),
    )
    assert.equal(
      wrongArm.length,
      0,
      `${event} linear-write-guard must not arm docs-updater/feedback-validator`,
    )
  }
})

test("isLinearWriteTool guards issue, comment, and project-status writers", () => {
  assert.equal(isLinearWriteTool("save_issue"), true)
  assert.equal(isLinearWriteTool("save_comment"), true)
  assert.equal(isLinearWriteTool("save_status_update"), true)
  assert.equal(isLinearWriteTool("list_issues"), false)
  assert.equal(isLinearWriteTool("get_status_updates"), false)
  assert.equal(isLinearWriteTool("get_issue"), false)
  assert.equal(isLinearWriteTool("save_document"), false)
})

test("checkLinearWrite denies Linear writes unless allowed", () => {
  assert.equal(checkLinearWrite(LINEAR, "save_issue", false)?.deny, true)
  assert.equal(checkLinearWrite(LINEAR, "save_comment", false)?.deny, true)
  assert.equal(
    checkLinearWrite(LINEAR, "save_status_update", false)?.deny,
    true,
  )
  assert.equal(checkLinearWrite(LINEAR, "save_issue", true), null)
  assert.equal(checkLinearWrite(LINEAR, "save_status_update", true), null)
  assert.equal(checkLinearWrite(LINEAR, "list_issues", false), null)
  assert.equal(
    checkLinearWrite("plugin-vercel-vercel", "save_issue", false),
    null,
  )
})

const LINEAR_STATE_PRIOR = existsSync(LINEAR_STATE)
  ? readFileSync(LINEAR_STATE, "utf8")
  : null

describe("linear-write spawn-level", { concurrency: 1 }, () => {
  after(() => {
    if (LINEAR_STATE_PRIOR === null) {
      if (existsSync(LINEAR_STATE)) unlinkSync(LINEAR_STATE)
    } else {
      writeFileSync(LINEAR_STATE, LINEAR_STATE_PRIOR, "utf8")
    }
  })

  test("BOM save_issue denies when flag is off", async () => {
    setAllowed(false)
    const { code, out } = await runGuard(SAVE_ISSUE)
    assert.equal(code, 0)
    assert.equal(JSON.parse(out).permission, "deny")
  })

  test("BOM save_issue allows when flag is on", async () => {
    setAllowed(true)
    const { code, out } = await runGuard(SAVE_ISSUE)
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(out), {})
  })

  test("BOM save_status_update denies when flag is off", async () => {
    setAllowed(false)
    const { code, out } = await runGuard(SAVE_STATUS_UPDATE)
    assert.equal(code, 0)
    assert.equal(JSON.parse(out).permission, "deny")
  })

  test("BOM save_status_update allows only while resolver flag is on", async () => {
    setAllowed(true)
    const { code, out } = await runGuard(SAVE_STATUS_UPDATE)
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(out), {})
  })

  test("BOM CLARIFY save_comment is resolver-only", async () => {
    setAllowed(false)
    const denied = await runGuard(SAVE_CLARIFICATION)
    assert.equal(denied.code, 0)
    assert.equal(JSON.parse(denied.out).permission, "deny")

    setAllowed(true)
    const allowed = await runGuard(SAVE_CLARIFICATION)
    assert.equal(allowed.code, 0)
    assert.deepEqual(JSON.parse(allowed.out), {})
  })

  test("BOM list_issues allows when flag is off", async () => {
    setAllowed(false)
    const { code, out } = await runGuard(LIST_ISSUES)
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(out), {})
  })

  test("linear-resolver start/stop toggles the allow flag", async () => {
    setAllowed(false)
    const start = await runGuard("{}", ["start"])
    assert.equal(start.code, 0)
    assert.equal(isAllowed(), true)
    const stop = await runGuard("{}", ["stop"])
    assert.equal(stop.code, 0)
    assert.equal(isAllowed(), false)
  })
})
