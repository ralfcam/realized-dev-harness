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
import { applyUpgrade, planUpgrade } from "../bootstrap/upgrade.mjs"
import { writeJsonAtomic } from "../bootstrap/io.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "upgrade-test-"))
  temporary.push(root)
  mkdirSync(join(root, ".cursor", "bootstrap"), { recursive: true })
  cpSync(
    join(process.cwd(), ".cursor", "bootstrap", "manifest.json"),
    join(root, ".cursor", "bootstrap", "manifest.json"),
  )
  writeFileSync(
    join(root, ".cursor", "harness.json"),
    `${JSON.stringify({ schemaVersion: 1, initialized: true, project: { name: "example" } }, null, 2)}\n`,
  )
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "example", private: true, scripts: {}, devDependencies: {} }, null, 2)}\n`,
  )
  return root
}

test("upgrade is dry-run plannable and applies bundled compatibility migration", () => {
  const root = fixture()
  const plan = planUpgrade(root)
  assert.equal(plan.fromVersion, "0.1.0")
  assert.deepEqual(plan.collisions, [])
  assert.deepEqual(plan.changes.sort(), [".cursor/harness.json", "package.json"])
  const cli = execFileSync(
    process.execPath,
    [join(process.cwd(), ".cursor", "bootstrap", "upgrade.mjs"), "--", "--dry-run"],
    { cwd: root, encoding: "utf8" },
  )
  assert.equal(JSON.parse(cli).mode, "dry-run")
  const applied = applyUpgrade(root)
  assert.equal(applied.applied, true)
  const config = JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf8"))
  const state = JSON.parse(readFileSync(join(root, ".cursor", "upgrade-state.json"), "utf8"))
  assert.equal(config.harnessVersion, "0.2.0")
  assert.equal(
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")).packageManager,
    "pnpm@10.34.5",
  )
  assert.equal(state.phase, "complete")
  assert.equal(planUpgrade(root).changes.length, 0)
})

test("upgrade refuses customized managed script collisions", () => {
  const root = fixture()
  const packagePath = join(root, "package.json")
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"))
  pkg.scripts["verify:local"] = "custom-command"
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
  assert.deepEqual(planUpgrade(root).collisions, ["scripts.verify:local"])
  assert.throws(() => applyUpgrade(root), /Upgrade collisions/)
})

test("failed upgrade restores both managed manifests", () => {
  const root = fixture()
  const configPath = join(root, ".cursor", "harness.json")
  const packagePath = join(root, "package.json")
  const beforeConfig = readFileSync(configPath, "utf8")
  const beforePackage = readFileSync(packagePath, "utf8")
  let failed = false
  const write = (path, value) => {
    if (!failed && path === packagePath && value.scripts?.["harness:upgrade"]) {
      failed = true
      throw new Error("injected write failure")
    }
    writeJsonAtomic(path, value)
  }
  assert.throws(() => applyUpgrade(root, { write }), /injected write failure/)
  assert.equal(readFileSync(configPath, "utf8"), beforeConfig)
  assert.equal(readFileSync(packagePath, "utf8"), beforePackage)
  const state = JSON.parse(readFileSync(join(root, ".cursor", "upgrade-state.json"), "utf8"))
  assert.equal(state.phase, "rolled_back")
})
