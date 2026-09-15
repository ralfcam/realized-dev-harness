import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"

// `/intake` Step 3 is prose an agent executes, not a module it imports, so the
// claim under test is the git semantics that prose relies on: that the two
// ancestry checks separate a safe retarget from one that drags
// origin/staging..origin/main into the PR diff. The topology below mirrors the
// real repo at the gold freeze — staging trailing main — in a throwaway repo so
// the verdicts stay deterministic as the real branches move.

const COMMAND_REL = ".cursor/commands/intake.md"

let repo = null

function git(args, cwd = repo) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
}

/** Runs a git command for its exit code alone (0, 1, or 128 for a bad ref). */
function gitExit(args) {
  try {
    execFileSync("git", args, { cwd: repo, stdio: "pipe" })
    return 0
  } catch (err) {
    return typeof err.status === "number" ? err.status : 128
  }
}

function commit(message) {
  writeFileSync(join(repo, "file.txt"), `${message}\n`)
  git(["add", "file.txt"])
  git(["commit", "-m", message])
  return git(["rev-parse", "HEAD"])
}

/**
 * The Step 3 decision, composed from the three commands the command file
 * names. Returns the verdict an agent following the prose must reach.
 */
function classify(head) {
  const descendant = gitExit(["merge-base", "--is-ancestor", "staging", head])
  if (descendant === 1) return "stop-rebase"
  if (descendant !== 0) return "stop-cannot-verify"

  const behind = Number(git(["rev-list", "--count", "staging..main"]))
  const mainInHead = gitExit(["merge-base", "--is-ancestor", "main", head])
  if (behind > 0 && mainInHead === 0) return "stop-drag-in"

  return "retarget"
}

const heads = {}

before(() => {
  repo = mkdtempSync(join(tmpdir(), "intake-ancestry-"))
  git(["init", "--initial-branch=main", "--quiet"], repo)
  git(["config", "user.email", "check@example.invalid"])
  git(["config", "user.name", "intake check"])
  git(["config", "commit.gpgsign", "false"])

  heads.base = commit("c0 base")
  heads.staging = commit("c1 staging tip")
  git(["branch", "staging"])
  commit("c2 main only")
  heads.main = commit("c3 main only")

  // A head branched off staging's tip — the shape a rebased cloud head has.
  git(["checkout", "--quiet", "-b", "from-staging", "staging"])
  heads.fromStaging = commit("c4 cloud work on staging")
  git(["checkout", "--quiet", "main"])
})

after(() => {
  if (repo && existsSync(repo)) rmSync(repo, { recursive: true, force: true })
})

test("topology reproduces staging trailing main", () => {
  assert.equal(Number(git(["rev-list", "--count", "staging..main"])), 2)
  assert.equal(gitExit(["merge-base", "--is-ancestor", "staging", "main"]), 0)
})

test("a head cut from main is refused — retargeting would drag staging..main", () => {
  // The trap the descendant check alone misses: main IS a descendant of the
  // older staging, so check 1 passes and only the drag-in check catches it.
  assert.equal(
    gitExit(["merge-base", "--is-ancestor", "staging", heads.main]),
    0,
  )
  assert.equal(classify(heads.main), "stop-drag-in")
})

test("a head cut from staging retargets — drag-in does not fire", () => {
  assert.equal(
    gitExit(["merge-base", "--is-ancestor", "staging", heads.fromStaging]),
    0,
  )
  assert.equal(
    gitExit(["merge-base", "--is-ancestor", "main", heads.fromStaging]),
    1,
  )
  assert.equal(classify(heads.fromStaging), "retarget")
})

test("a head predating staging's tip is refused pending a rebase", () => {
  assert.equal(
    gitExit(["merge-base", "--is-ancestor", "staging", heads.base]),
    1,
  )
  assert.equal(classify(heads.base), "stop-rebase")
})

test("a missing ref is cannot-verify, never a retarget", () => {
  assert.equal(
    gitExit(["merge-base", "--is-ancestor", "staging", "no-such-ref"]),
    128,
  )
  assert.equal(classify("no-such-ref"), "stop-cannot-verify")
})

test("drag-in cannot fire once staging has caught up to main", () => {
  git(["checkout", "--quiet", "staging"])
  git(["merge", "--quiet", "--ff-only", "main"])
  try {
    assert.equal(Number(git(["rev-list", "--count", "staging..main"])), 0)
    assert.equal(classify(heads.main), "retarget")
  } finally {
    git(["checkout", "--quiet", "main"])
  }
})

test("the command file still names all three ancestry commands", () => {
  const text = readFileSync(join(process.cwd(), COMMAND_REL), "utf8")
  for (const cmd of [
    "git merge-base --is-ancestor origin/staging",
    "git rev-list --count origin/staging..origin/main",
    "git merge-base --is-ancestor origin/main",
  ]) {
    assert.ok(text.includes(cmd), `${COMMAND_REL} must name \`${cmd}\``)
  }
})
