import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach } from "node:test"
import { test } from "node:test"
import { runHarnessLint } from "./harness-lint.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function lintFixture() {
  const root = mkdtempSync(join(tmpdir(), "harness-lint-test-"))
  temporary.push(root)
  cpSync(join(process.cwd(), "docs"), join(root, "docs"), { recursive: true })
  mkdirSync(join(root, ".cursor", "bootstrap"), { recursive: true })
  cpSync(join(process.cwd(), ".cursor", "harness.json"), join(root, ".cursor", "harness.json"))
  cpSync(
    join(process.cwd(), ".cursor", "bootstrap", "manifest.json"),
    join(root, ".cursor", "bootstrap", "manifest.json"),
  )
  cpSync(join(process.cwd(), "package.json"), join(root, "package.json"))
  return root
}

function lint(root) {
  return spawnSync(process.execPath, [join(process.cwd(), ".cursor", "checks", "harness-lint.mjs")], {
    cwd: root,
    encoding: "utf8",
  })
}

test("generic harness and OKF bundle lint cleanly", () => {
  assert.deepEqual(runHarnessLint(), [])
})

test("OKF lint rejects unreachable concepts and malformed trust metadata", () => {
  const root = lintFixture()
  writeFileSync(
    join(root, "docs", "product", "orphan.md"),
    `---\ntype: Product Context\nstatus: stable\ngenerated:\n  by: invalid actor\n  at: yesterday\n---\n\n# Orphan\n`,
  )
  const result = lint(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /generated\.by: invalid actor/)
  assert.match(result.stderr, /generated\.at must be an ISO 8601 timestamp/)
  assert.match(result.stderr, /concept is not reachable/)
})

test("OKF lint validates work-item specification types and strict internal links", () => {
  const root = lintFixture()
  writeFileSync(
    join(root, "docs", "work-items", "invalid.md"),
    `---\ntype: Work Item\ntitle: Invalid\nstatus: draft\nworkflow_state: ready\npriority: high\nspec: /product/context.md\n---\n\nSee [missing](/specs/missing.md).\n`,
  )
  const index = join(root, "docs", "work-items", "index.md")
  writeFileSync(index, `# Work items\n\n* [Invalid](invalid.md) - Invalid fixture.\n`)
  const result = lint(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /spec must link to a concept with type Specification/)
  assert.match(result.stderr, /broken link \/specs\/missing\.md/)
})
