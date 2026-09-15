import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { detectLinearSpawn } from "../hooks/lib/linear-spawn-policy.mjs"

const hooks = JSON.parse(
  readFileSync(join(process.cwd(), ".cursor", "hooks.json"), "utf8"),
)
const LINEAR = "plugin-linear-linear"
const VERCEL = "plugin-vercel-vercel"

function hookByCommand(event, needle) {
  return (hooks.hooks[event] || []).find((h) => h.command.includes(needle))
}

test("linear-spawn-guard is registered on beforeMCPExecution, fail-open", () => {
  const hook = hookByCommand("beforeMCPExecution", "linear-spawn-guard.mjs")
  assert.ok(hook, "linear-spawn-guard is registered on beforeMCPExecution")
  assert.equal(hook.failClosed, false)
})

test("linear-spawn-guard.mjs wires detectLinearSpawn", () => {
  const src = readFileSync(
    join(process.cwd(), ".cursor", "hooks", "linear-spawn-guard.mjs"),
    "utf8",
  )
  assert.match(src, /detectLinearSpawn/)
})

test("detectLinearSpawn denies assignee as a string and as null", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_issue", { assignee: "Cursor" }).kind,
    "assignee",
  )
  assert.equal(
    detectLinearSpawn(LINEAR, "save_issue", { assignee: null }).kind,
    "assignee",
  )
})

test("detectLinearSpawn denies delegate", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_issue", { delegate: "Cursor" }).kind,
    "delegate",
  )
})

test("detectLinearSpawn denies @Cursor in a comment body", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_comment", { body: "@Cursor please look" })
      .kind,
    "mention",
  )
})

test("detectLinearSpawn denies @Cursor injected only via a patch op", () => {
  const hit = detectLinearSpawn(LINEAR, "save_issue", {
    id: "RES-1",
    patch: [{ op: "append", text: "@Cursor please look" }],
  })
  assert.equal(hit.kind, "mention")
  assert.equal(hit.field, "text")
})

test("detectLinearSpawn denies @Cursor even when surrounding prose negates it", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_comment", {
      body: "do not assign to @Cursor",
    }).kind,
    "mention",
  )
})

test("detectLinearSpawn allows a state-only save_issue", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_issue", {
      id: "RES-1",
      state: "In Progress",
    }),
    null,
  )
})

test("detectLinearSpawn allows an ordinary comment", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_comment", {
      body: "Work started: plan foo",
    }),
    null,
  )
})

test("CLARIFY comments remain subject to the Cursor-mention spawn guard", () => {
  const unsafe = [
    "Clarification required",
    "Key: clarify:RES-42:booking-rules:BW-9",
    "Decision question: Should @Cursor choose option A?",
  ].join("\n")
  assert.equal(
    detectLinearSpawn(LINEAR, "save_comment", { body: unsafe }).kind,
    "mention",
  )

  const safe = unsafe.replace("@Cursor", "the Cursor integration")
  assert.equal(detectLinearSpawn(LINEAR, "save_comment", { body: safe }), null)
})

test("detectLinearSpawn denies @Cursor in a project status-update body", () => {
  const hit = detectLinearSpawn(LINEAR, "save_status_update", {
    type: "project",
    project: "V-1.2",
    body: "Audit result for @Cursor",
    health: "atRisk",
  })
  assert.equal(hit.kind, "mention")
  assert.equal(hit.field, "body")
})

test("detectLinearSpawn allows a clean project status update", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_status_update", {
      type: "project",
      project: "V-1.2",
      body: "Audit run key: audit:2026-09-11:abc123:scope=complete:project=none:issues=none",
      health: "onTrack",
    }),
    null,
  )
})

test("detectLinearSpawn denies @Cursor in a save_document title", () => {
  const hit = detectLinearSpawn(LINEAR, "save_document", {
    title: "Plan for @Cursor",
    content: "ok",
  })
  assert.equal(hit.kind, "mention")
  assert.equal(hit.field, "title")
})

test("detectLinearSpawn denies @Cursor in save_document content", () => {
  const hit = detectLinearSpawn(LINEAR, "save_document", {
    title: "Plan — sg-1",
    content: "Do not mention @Cursor in the plan.",
  })
  assert.equal(hit.kind, "mention")
  assert.equal(hit.field, "content")
})

test("detectLinearSpawn denies @Cursor injected only via a save_document patch op", () => {
  const hit = detectLinearSpawn(LINEAR, "save_document", {
    id: "doc-1",
    patch: [{ op: "append", text: "@Cursor please look" }],
  })
  assert.equal(hit.kind, "mention")
  assert.equal(hit.field, "text")
})

test("detectLinearSpawn allows a clean save_document", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_document", {
      title: "Plan — sg-1",
      content: "Mode: FIX\nOwning spec: docs/specs/foo.md",
      issue: "RES-1",
    }),
    null,
  )
})

test("detectLinearSpawn does not scan save_project (knowingly out of scope)", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_project", {
      name: "V-1.2",
      description: "@Cursor please look",
    }),
    null,
  )
})

test("detectLinearSpawn allows get_issue (read-only; not a spawn door)", () => {
  assert.equal(detectLinearSpawn(LINEAR, "get_issue", { id: "RES-1" }), null)
})

test("detectLinearSpawn does not scan save_comment.patch (schema has no patch)", () => {
  assert.equal(
    detectLinearSpawn(LINEAR, "save_comment", {
      body: "ok",
      patch: [{ text: "@Cursor please look" }],
    }),
    null,
  )
})

test("detectLinearSpawn allows the same spawn payload on a non-Linear server", () => {
  assert.equal(
    detectLinearSpawn(VERCEL, "save_comment", { body: "@Cursor please look" }),
    null,
  )
  assert.equal(
    detectLinearSpawn(VERCEL, "save_issue", { assignee: "Cursor" }),
    null,
  )
})

function runSpawnGuard(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      join(process.cwd(), ".cursor", "hooks", "linear-spawn-guard.mjs"),
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

test("linear-spawn-guard denies assignee from a BOM-prefixed beforeMCPExecution payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "save_issue",
      tool_input: JSON.stringify({ id: "RES-1", assignee: "Cursor" }),
      mcp_server_name: "linear",
      command: "linear",
      hook_event_name: "beforeMCPExecution",
    })
  const { code, out } = await runSpawnGuard(payload)
  assert.equal(code, 0)
  assert.equal(JSON.parse(out).permission, "deny")
})

test("linear-spawn-guard allows get_issue from a BOM-prefixed beforeMCPExecution payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "get_issue",
      tool_input: JSON.stringify({ id: "RES-360" }),
      mcp_server_name: "linear",
      command: "linear",
      hook_event_name: "beforeMCPExecution",
    })
  const { code, out } = await runSpawnGuard(payload)
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(out), {})
})

test("linear-spawn-guard denies @Cursor in a BOM-prefixed status update payload", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "save_status_update",
      tool_input: JSON.stringify({
        type: "project",
        project: "V-1.2",
        body: "Audit asks @Cursor to follow up",
        health: "atRisk",
      }),
      mcp_server_name: "linear",
      command: "linear",
      hook_event_name: "beforeMCPExecution",
    })
  const { code, out } = await runSpawnGuard(payload)
  assert.equal(code, 0)
  assert.equal(JSON.parse(out).permission, "deny")
})
