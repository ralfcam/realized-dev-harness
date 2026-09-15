import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import { parse as parseYaml } from "yaml"
import {
  createWorkItem,
  dispatchWorkItems,
  triageWorkItem,
} from "../bootstrap/work-items.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function root() {
  const directory = mkdtempSync(join(tmpdir(), "work-items-test-"))
  temporary.push(directory)
  cpSync(join(process.cwd(), "docs"), join(directory, "docs"), { recursive: true })
  mkdirSync(join(directory, ".cursor"), { recursive: true })
  writeFileSync(
    join(directory, ".cursor", "harness.json"),
    JSON.stringify({ dispatch: { minimumActive: 1, maximumActive: 3 } }),
  )
  writeFileSync(
    join(directory, "docs", "specs", "example.md"),
    `---\ntype: Specification\ntitle: Example\nstatus: draft\n---\n\n# Intent\n\nExample.\n`,
  )
  return directory
}

function frontmatter(path) {
  const text = readFileSync(path, "utf8")
  const end = text.indexOf("\n---\n", 4)
  return parseYaml(text.slice(4, end))
}

const clock = { now: () => new Date("2026-09-15T12:00:00.000Z") }

test("create and triage maintain canonical local work items", () => {
  const directory = root()
  const created = createWorkItem(
    directory,
    { id: "first-item", title: "First item", priority: "medium", spec: "/specs/example.md" },
    clock,
  )
  assert.equal(created.workflow_state, "backlog")
  assert.match(readFileSync(join(directory, "docs", "work-items", "index.md"), "utf8"), /first-item\.md/)
  const triaged = triageWorkItem(
    directory,
    { id: "first-item", state: "ready", priority: "high" },
    clock,
  )
  assert.deepEqual(triaged, {
    id: "first-item",
    workflow_state: "ready",
    priority: "high",
  })
  const data = frontmatter(join(directory, "docs", "work-items", "first-item.md"))
  assert.equal(data.spec, "/specs/example.md")
  assert.equal(data.generated.by, "process:realized-dev-harness-work-items")
})

test("dispatch ranks ready work and never exceeds configured capacity", () => {
  const directory = root()
  for (const [id, priority] of [
    ["low-item", "low"],
    ["critical-item", "critical"],
    ["high-item", "high"],
    ["medium-item", "medium"],
  ]) {
    createWorkItem(
      directory,
      { id, title: id, priority, spec: "/specs/example.md" },
      clock,
    )
    triageWorkItem(directory, { id, state: "ready" }, clock)
  }
  const preview = dispatchWorkItems(directory, { dryRun: true }, clock)
  assert.deepEqual(preview.map((item) => item.id), ["critical-item", "high-item", "medium-item"])
  assert.equal(frontmatter(join(directory, "docs", "work-items", "critical-item.md")).workflow_state, "ready")
  const cli = execFileSync(
    process.execPath,
    [join(process.cwd(), ".cursor", "bootstrap", "work-items.mjs"), "--", "dispatch", "--dry-run"],
    { cwd: directory, encoding: "utf8" },
  )
  assert.equal(JSON.parse(cli).length, 3)
  dispatchWorkItems(directory, {}, clock)
  assert.equal(frontmatter(join(directory, "docs", "work-items", "critical-item.md")).workflow_state, "in_progress")
  assert.equal(frontmatter(join(directory, "docs", "work-items", "low-item.md")).workflow_state, "ready")
  assert.deepEqual(dispatchWorkItems(directory, {}, clock), [])
})

test("work-item helpers reject invalid specifications and transitions", () => {
  const directory = root()
  assert.throws(
    () =>
      createWorkItem(directory, {
        id: "bad-item",
        title: "Bad",
        priority: "urgent",
        spec: "/specs/missing.md",
      }),
    /Invalid --priority/,
  )
  assert.throws(
    () =>
      createWorkItem(directory, {
        id: "bad-item",
        title: "Bad",
        priority: "high",
        spec: "/specs/missing.md",
      }),
    /does not exist/,
  )
})
