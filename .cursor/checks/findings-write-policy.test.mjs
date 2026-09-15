import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, describe, test } from "node:test"
import {
  checkFindingsWrite,
  isAllowed,
  isFindingsPath,
  setAllowed,
} from "../hooks/lib/findings-write-policy.mjs"

const hooks = JSON.parse(
  readFileSync(join(process.cwd(), ".cursor", "hooks.json"), "utf8"),
)
const FINDINGS_STATE = join(
  process.cwd(),
  ".cursor",
  "hooks",
  "state",
  "findings-writer.json",
)
const WRITE_PRODUCT_GAPS =
  "\uFEFF" +
  JSON.stringify({
    tool_name: "Write",
    tool_input: { path: "docs/findings/product-gaps.md" },
  })

function hookByCommand(event, needle) {
  return (hooks.hooks[event] || []).find((h) => h.command.includes(needle))
}

function runGuard(payload, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      join(process.cwd(), ".cursor", "hooks", "findings-write-guard.mjs"),
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

test("findings-write-guard is fail-open Write; docs-updater start/stop set the flag", () => {
  const write = hookByCommand("preToolUse", "findings-write-guard.mjs")
  assert.ok(write, "findings-write-guard is registered on preToolUse")
  assert.equal(write.matcher, "Write")
  assert.equal(write.failClosed, false)
  const start = hookByCommand("subagentStart", "findings-write-guard.mjs")
  assert.ok(start, "findings-write-guard start is registered")
  assert.equal(start.matcher, "docs-updater")
  assert.match(start.command, /\bstart\b/)
  const stop = hookByCommand("subagentStop", "findings-write-guard.mjs")
  assert.ok(stop, "findings-write-guard stop is registered")
  assert.equal(stop.matcher, "docs-updater")
  assert.match(stop.command, /\bstop\b/)
  for (const event of ["subagentStart", "subagentStop"]) {
    const others = (hooks.hooks[event] || []).filter(
      (h) =>
        h.command.includes("findings-write-guard.mjs") &&
        /linear-resolver|feedback-validator/.test(h.matcher || ""),
    )
    assert.equal(
      others.length,
      0,
      `${event} findings-write-guard must not arm linear-resolver/feedback-validator`,
    )
  }
})

test("isFindingsPath covers ledger files and probe-scratch paths", () => {
  assert.equal(isFindingsPath("docs/findings/product-gaps.md"), true)
  assert.equal(isFindingsPath("docs/findings/.probe-scratch.md"), true)
  assert.equal(isFindingsPath("docs/specs/REQ-001.md"), false)
  assert.equal(isFindingsPath("lib/foo.ts"), false)
})

test("checkFindingsWrite denies findings paths unless allowed", () => {
  assert.equal(
    checkFindingsWrite("docs/findings/product-gaps.md", false)?.deny,
    true,
  )
  assert.equal(checkFindingsWrite("docs/findings/product-gaps.md", true), null)
  assert.equal(checkFindingsWrite("lib/foo.ts", false), null)
})

const FINDINGS_STATE_PRIOR = existsSync(FINDINGS_STATE)
  ? readFileSync(FINDINGS_STATE, "utf8")
  : null

describe("findings-write spawn-level", { concurrency: 1 }, () => {
  after(() => {
    if (FINDINGS_STATE_PRIOR === null) {
      if (existsSync(FINDINGS_STATE)) unlinkSync(FINDINGS_STATE)
    } else {
      writeFileSync(FINDINGS_STATE, FINDINGS_STATE_PRIOR, "utf8")
    }
  })

  test("BOM Write to docs/findings/product-gaps.md denies when flag is off", async () => {
    setAllowed(false)
    const { code, out } = await runGuard(WRITE_PRODUCT_GAPS)
    assert.equal(code, 0)
    assert.equal(JSON.parse(out).permission, "deny")
  })

  test("BOM Write to docs/findings/product-gaps.md allows when flag is on", async () => {
    setAllowed(true)
    const { code, out } = await runGuard(WRITE_PRODUCT_GAPS)
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(out), {})
  })

  test("docs-updater start/stop toggles the allow flag", async () => {
    setAllowed(false)
    const start = await runGuard("{}", ["start"])
    assert.equal(start.code, 0)
    assert.equal(isAllowed(), true)
    const stop = await runGuard("{}", ["stop"])
    assert.equal(stop.code, 0)
    assert.equal(isAllowed(), false)
  })
})
