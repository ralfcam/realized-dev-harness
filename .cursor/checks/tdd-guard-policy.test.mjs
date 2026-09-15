import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, describe, test } from "node:test"
import { tmpdir } from "node:os"
import {
  arm,
  checkTddWrite,
  clearPhase,
  detectBlanketGitStage,
  detectGhPrMerge,
  detectGitCommit,
  disarm,
  getCommitExempt,
  isLoopRan,
  openCommitGate,
  setPhase,
} from "../hooks/lib/tdd-guard-policy.mjs"
import { TASK_FANOUT_INFLIGHT_CAP } from "../hooks/lib/task-fanout-policy.mjs"

const hooks = JSON.parse(
  readFileSync(join(process.cwd(), ".cursor", "hooks.json"), "utf8"),
)
const FANOUT_STATE = join(
  process.cwd(),
  ".cursor",
  "hooks",
  "state",
  "task-fanout.json",
)
const TDD_STATE = join(
  process.cwd(),
  ".cursor",
  "hooks",
  "state",
  "tdd-guard.json",
)
const REPEAT_STATE = join(
  process.cwd(),
  ".cursor",
  "hooks",
  "state",
  "repeat-tool.json",
)
// Cursor reports tool_name "Write" for a StrReplace call, and carries the target
// in tool_input.path — both observed from a live armed preToolUse denial.
const WRITE_LIB_BILLING =
  "\uFEFF" +
  JSON.stringify({
    tool_name: "Write",
    tool_input: { path: "lib/billing/foo.ts" },
  })
const WRITE_SPEC =
  "\uFEFF" +
  JSON.stringify({
    tool_name: "Write",
    tool_input: { path: "docs/specs/REQ-001.md" },
  })

function hookByCommand(event, needle) {
  return (hooks.hooks[event] || []).find((h) => h.command.includes(needle))
}

function runGuard(scriptName, payload, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(process.cwd(), ".cursor", "hooks", scriptName), ...extraArgs],
      {
        env: {
          ...process.env,
          CODERABBIT_STATE_DIR: join(tmpdir(), `cr-idle-${process.pid}`),
        },
      },
    )
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

test("git-stage guard is failClosed; TDD delegation guard is fail-open", () => {
  const git = hookByCommand("preToolUse", "git-stage-guard.mjs")
  const tdd = hookByCommand("preToolUse", "tdd-delegation-guard.mjs")
  assert.ok(git, "git-stage-guard is registered on preToolUse")
  assert.equal(git.failClosed, true)
  assert.equal(git.matcher, "Shell")
  assert.ok(tdd, "tdd-delegation-guard is registered on preToolUse")
  assert.equal(tdd.failClosed, false)
})

test("hooks.json has exactly one failClosed Shell hook (git-stage-guard)", () => {
  const shellFailClosed = (hooks.hooks.preToolUse || []).filter(
    (h) => h.failClosed === true && h.matcher === "Shell",
  )
  assert.equal(shellFailClosed.length, 1)
  assert.ok(shellFailClosed[0].command.includes("git-stage-guard.mjs"))
})

test("git-stage-guard.mjs wires both blanket-stage and gh pr merge detectors", () => {
  const src = readFileSync(
    join(process.cwd(), ".cursor", "hooks", "git-stage-guard.mjs"),
    "utf8",
  )
  assert.match(src, /detectGhPrMerge/)
  assert.match(src, /detectBlanketGitStage/)
})

test("commit authorization hooks do not read or mutate CodeRabbit receipts", () => {
  const hookDir = join(process.cwd(), ".cursor", "hooks")
  const tddGuard = readFileSync(join(hookDir, "tdd-guard.mjs"), "utf8")
  const gitStageGuard = readFileSync(
    join(hookDir, "git-stage-guard.mjs"),
    "utf8",
  )
  const afterCommit = readFileSync(
    join(hookDir, "after-git-commit.mjs"),
    "utf8",
  )
  for (const [name, source] of [
    ["tdd-guard", tddGuard],
    ["git-stage-guard", gitStageGuard],
    ["after-git-commit", afterCommit],
  ]) {
    assert.doesNotMatch(source, /coderabbit-review-policy/, name)
    assert.doesNotMatch(source, /loadReceipt|saveReceipt/, name)
  }
})

test("detectBlanketGitStage denies git add -A, git add ., git commit -a", () => {
  assert.equal(detectBlanketGitStage("git add -A").kind, "add")
  assert.equal(detectBlanketGitStage("git add --all").kind, "add")
  assert.equal(detectBlanketGitStage("git add .").kind, "add")
  assert.equal(detectBlanketGitStage("git commit -a -m msg").kind, "commit")
  assert.equal(detectBlanketGitStage("git commit --all -m msg").kind, "commit")
  assert.equal(detectBlanketGitStage("pnpm test; git add -A").kind, "add")
})

test("detectBlanketGitStage allows an explicit path stage", () => {
  assert.equal(detectBlanketGitStage("git add lib/foo.ts"), null)
  assert.equal(detectBlanketGitStage("git add tests/a.ts lib/foo.ts"), null)
  assert.equal(detectBlanketGitStage("git commit -m msg"), null)
})

test("detectGhPrMerge denies gh pr merge and allows other gh pr commands", () => {
  assert.equal(detectGhPrMerge("gh pr merge").kind, "pr-merge")
  assert.equal(detectGhPrMerge("gh pr merge 12 --squash").kind, "pr-merge")
  assert.equal(detectGhPrMerge("pnpm test; gh pr merge").kind, "pr-merge")
  assert.equal(detectGhPrMerge("gh pr create --base staging"), null)
  assert.equal(detectGhPrMerge("gh pr view 1"), null)
  assert.equal(detectGhPrMerge("gh pr edit --add-reviewer foo"), null)
  assert.equal(detectGhPrMerge("gh pr ready 1"), null)
})

test("red phase denies a lib/ path and allows tests/", () => {
  const deny = checkTddWrite("lib/foo.ts", { depth: 1, phase: "red" })
  const allow = checkTddWrite("tests/foo.test.ts", { depth: 1, phase: "red" })
  assert.equal(deny?.kind, "phase-red")
  assert.equal(allow, null)
})

test("green and refactor deny tests/ and allow lib/", () => {
  for (const phase of ["green", "refactor"]) {
    const deny = checkTddWrite("tests/foo.test.ts", { depth: 1, phase })
    const allow = checkTddWrite("lib/foo.ts", { depth: 1, phase })
    assert.equal(deny?.kind, "phase-tests", phase)
    assert.equal(allow, null, phase)
  }
})

test("spec guard denies docs/specs/** while a TDD phase is set", () => {
  const deny = checkTddWrite("docs/specs/REQ-001.md", {
    depth: 1,
    phase: "green",
  })
  const allowParent = checkTddWrite("docs/specs/REQ-001.md", {
    depth: 0,
    phase: null,
  })
  const allowDuringStart = checkTddWrite("docs/specs/REQ-001.md", {
    depth: 1,
    phase: null,
  })
  assert.equal(deny?.kind, "spec")
  assert.equal(allowParent, null)
  assert.equal(allowDuringStart, null)
})

test("repeat-tool-reminder is fail-open on both events", () => {
  const post = hookByCommand("postToolUse", "repeat-tool-reminder.mjs")
  const fail = hookByCommand("postToolUseFailure", "repeat-tool-reminder.mjs")
  assert.ok(post)
  assert.ok(fail)
  assert.equal(post.failClosed, false)
  assert.equal(fail.failClosed, false)
  assert.match(fail.command, /--failure/)
})

const BLANKET_ADD = JSON.stringify({
  tool_name: "Shell",
  tool_input: { command: "git add -A" },
})

test("git-stage-guard denies a BOM-prefixed blanket git add", async () => {
  const { code, out } = await runGuard(
    "git-stage-guard.mjs",
    "\uFEFF" + BLANKET_ADD,
  )
  assert.equal(code, 0)
  assert.equal(JSON.parse(out).permission, "deny")
})

test("git-stage-guard denies the same blanket git add without a BOM", async () => {
  const { code, out } = await runGuard("git-stage-guard.mjs", BLANKET_ADD)
  assert.equal(code, 0)
  assert.equal(JSON.parse(out).permission, "deny")
})

test("git-stage-guard allows a BOM-prefixed ordinary git status", async () => {
  const payload =
    "\uFEFF" +
    JSON.stringify({
      tool_name: "Shell",
      tool_input: { command: "git status" },
    })
  const { code, out } = await runGuard("git-stage-guard.mjs", payload)
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(out), {})
})

test("task-fanout-guard denies a BOM-prefixed Task when at cap", async () => {
  const prior = existsSync(FANOUT_STATE)
    ? readFileSync(FANOUT_STATE, "utf8")
    : null
  try {
    const now = Date.now()
    const reservations = Array.from(
      { length: TASK_FANOUT_INFLIGHT_CAP },
      () => ({
        status: "pending",
        ts: now,
      }),
    )
    writeFileSync(
      FANOUT_STATE,
      JSON.stringify({ reservations }, null, 2),
      "utf8",
    )
    const payload =
      "\uFEFF" +
      JSON.stringify({
        tool_name: "Task",
        tool_input: { description: "x", prompt: "y" },
      })
    const { code, out } = await runGuard("task-fanout-guard.mjs", payload)
    assert.equal(code, 0)
    assert.equal(JSON.parse(out).permission, "deny")
  } finally {
    if (prior === null)
      writeFileSync(
        FANOUT_STATE,
        JSON.stringify({ reservations: [] }, null, 2),
        "utf8",
      )
    else writeFileSync(FANOUT_STATE, prior, "utf8")
  }
})

// Captured at import, before any test writes, so the restore is independent of
// how the subtests interleave. A per-test capture can read another test's
// scratch state and write it back, stranding the operator with an ARMED guard.
const TDD_STATE_PRIOR = existsSync(TDD_STATE)
  ? readFileSync(TDD_STATE, "utf8")
  : null
const TDD_STATE_DISARMED = JSON.stringify(
  { armed: false, depth: 0, phase: null, loopRan: false },
  null,
  2,
)
const REPEAT_STATE_PRIOR = existsSync(REPEAT_STATE)
  ? readFileSync(REPEAT_STATE, "utf8")
  : null
const REPEAT_STATE_EMPTY = JSON.stringify({ chains: {} }, null, 2)
const FIRST_REMINDER_TEXT =
  "You are repeating the exact same tool call with identical arguments"

function writeTddState(state) {
  writeFileSync(TDD_STATE, JSON.stringify(state, null, 2), "utf8")
}

function readTddState() {
  return JSON.parse(readFileSync(TDD_STATE, "utf8"))
}

const GIT_COMMIT = JSON.stringify({
  tool_name: "Shell",
  tool_input: { command: "git commit -m msg" },
})

describe("tdd-guard spawn-level", { concurrency: 1 }, () => {
  after(() =>
    writeFileSync(TDD_STATE, TDD_STATE_PRIOR ?? TDD_STATE_DISARMED, "utf8"),
  )

  test("detectGitCommit matches any git commit and chained invocations", () => {
    assert.equal(detectGitCommit("git commit -m msg").kind, "commit")
    assert.equal(detectGitCommit("git commit -F file").kind, "commit")
    assert.equal(detectGitCommit("pnpm test; git commit -m msg").kind, "commit")
    assert.equal(detectGitCommit("git status"), null)
    assert.equal(detectGitCommit("git add lib/foo.ts"), null)
    assert.equal(detectGitCommit(""), null)
  })

  test("setPhase sets loopRan; clearPhase and disarm preserve it; arm resets it", () => {
    arm()
    assert.equal(isLoopRan(), false)
    setPhase("red")
    assert.equal(isLoopRan(), true)
    clearPhase()
    assert.equal(isLoopRan(), true)
    disarm()
    assert.equal(isLoopRan(), true)
    arm()
    assert.equal(isLoopRan(), false)
  })

  test("openCommitGate clears loopRan and records a valid exemption", () => {
    arm()
    setPhase("green")
    assert.equal(isLoopRan(), true)
    openCommitGate()
    assert.equal(isLoopRan(), false)
    assert.equal(getCommitExempt(), null)
    openCommitGate("docs-artifact")
    assert.equal(getCommitExempt(), "docs-artifact")
    openCommitGate("gate-remediation")
    assert.equal(getCommitExempt(), "gate-remediation")
    openCommitGate("not-a-lane")
    assert.equal(getCommitExempt(), null)
  })

  test("git-stage-guard denies a BOM-prefixed git commit when loopRan", async () => {
    writeTddState({ armed: false, depth: 0, phase: null, loopRan: true })
    const { code, out } = await runGuard(
      "git-stage-guard.mjs",
      "\uFEFF" + GIT_COMMIT,
    )
    assert.equal(code, 0)
    assert.equal(JSON.parse(out).permission, "deny")
    assert.match(JSON.parse(out).user_message, /TDD loop/)
  })

  test("git-stage-guard allows a BOM-prefixed git commit when loopRan is false", async () => {
    writeTddState({ armed: false, depth: 0, phase: null, loopRan: false })
    const { code, out } = await runGuard(
      "git-stage-guard.mjs",
      "\uFEFF" + GIT_COMMIT,
    )
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(out), {})
  })

  test("tdd-delegation-guard denies a BOM-prefixed Write when armed at depth 1 in red", async () => {
    writeTddState({ armed: true, depth: 1, phase: "red" })
    const { code, out } = await runGuard(
      "tdd-delegation-guard.mjs",
      WRITE_LIB_BILLING,
    )
    assert.equal(code, 0)
    const body = JSON.parse(out)
    assert.equal(body.permission, "deny")
    assert.match(body.user_message, /Red-phase/)
  })

  test("tdd-delegation-guard denies a BOM-prefixed Write when armed at depth 0", async () => {
    writeTddState({ armed: true, depth: 0, phase: null })
    const { code, out } = await runGuard(
      "tdd-delegation-guard.mjs",
      WRITE_LIB_BILLING,
    )
    assert.equal(code, 0)
    const body = JSON.parse(out)
    assert.equal(body.permission, "deny")
    assert.match(body.user_message, /orchestrator/)
  })

  test("tdd-delegation-guard allows a BOM-prefixed Write when unarmed", async () => {
    writeTddState({ armed: false, depth: 0, phase: null })
    const { code, out } = await runGuard(
      "tdd-delegation-guard.mjs",
      WRITE_LIB_BILLING,
    )
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(out), {})
  })

  test("tdd-delegation-guard allows a spec Write while START is in-flight (depth 1, phase null)", async () => {
    writeTddState({ armed: true, depth: 1, phase: null })
    const { code, out } = await runGuard("tdd-delegation-guard.mjs", WRITE_SPEC)
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(out), {})
  })

  test("tdd-delegation-guard denies a spec Write while a TDD phase is set", async () => {
    writeTddState({ armed: true, depth: 1, phase: "green" })
    const { code, out } = await runGuard("tdd-delegation-guard.mjs", WRITE_SPEC)
    assert.equal(code, 0)
    const body = JSON.parse(out)
    assert.equal(body.permission, "deny")
    assert.match(body.user_message, /read-only for subagents/)
  })

  test("tdd-guard-depth: armed start/stop moves depth 0 to 1 to 0", async () => {
    writeTddState({ armed: true, depth: 0, phase: null })
    const start = await runGuard("tdd-guard-depth.mjs", "{}", ["start"])
    assert.equal(start.code, 0)
    assert.equal(readTddState().depth, 1)
    const stop = await runGuard("tdd-guard-depth.mjs", "{}", ["stop"])
    assert.equal(stop.code, 0)
    assert.equal(readTddState().depth, 0)
  })

  test("tdd-guard-depth: unarmed start leaves depth at 0", async () => {
    writeTddState({ armed: false, depth: 0, phase: null })
    const start = await runGuard("tdd-guard-depth.mjs", "{}", ["start"])
    assert.equal(start.code, 0)
    assert.equal(readTddState().depth, 0)
  })
})

describe("repeat-tool-reminder spawn-level", { concurrency: 1 }, () => {
  after(() =>
    writeFileSync(
      REPEAT_STATE,
      REPEAT_STATE_PRIOR ?? REPEAT_STATE_EMPTY,
      "utf8",
    ),
  )

  test("third identical BOM-prefixed postToolUse carries the first-reminder advisory", async () => {
    const conversationId = `g-spawn-coverage-${process.pid}-${Date.now()}`
    const payload =
      "\uFEFF" +
      JSON.stringify({
        tool_name: "Grep",
        tool_input: { pattern: "g-spawn-coverage-probe", path: ".cursor" },
        conversation_id: conversationId,
        hook_event_name: "postToolUse",
      })
    let last
    for (let i = 0; i < 3; i++) {
      last = await runGuard("repeat-tool-reminder.mjs", payload)
      assert.equal(last.code, 0)
    }
    const body = JSON.parse(last.out)
    assert.match(body.additional_context, new RegExp(FIRST_REMINDER_TEXT))
  })
})
