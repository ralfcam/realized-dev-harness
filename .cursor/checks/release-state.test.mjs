import assert from "node:assert/strict"
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import { checkReleaseState } from "./release-state.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "release-state-test-"))
  temporary.push(root)
  mkdirSync(join(root, ".cursor"), { recursive: true })
  cpSync(join(process.cwd(), ".cursor", "harness.json"), join(root, ".cursor", "harness.json"))
  return root
}

test("source harness ships in its pre-init state", () => {
  assert.deepEqual(checkReleaseState(process.cwd()), [])
})

test("release check rejects initialized state, evidence, and application artifacts", () => {
  const root = fixture()
  const configPath = join(root, ".cursor", "harness.json")
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  config.initialized = true
  config.project = {
    name: "leaked-app",
    localSupabaseVerified: true,
    localSupabaseVerifiedAt: "2026-09-15T00:00:00Z",
    localSupabaseMigrationFingerprint: "abc123",
  }
  config.integrations.linear = { enabled: true, teamKey: "ENG" }
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  mkdirSync(join(root, "app"))
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() {}\n")
  writeFileSync(join(root, ".env"), "TRACKED_SECRET=unsafe\n")
  writeFileSync(join(root, ".env.local"), "LOCAL_ONLY=secret\n")

  const violations = checkReleaseState(root)
  assert.match(violations.join("\n"), /initialized=false/)
  assert.match(violations.join("\n"), /project\.name must be null/)
  assert.match(violations.join("\n"), /localSupabaseVerified must be absent/)
  assert.match(violations.join("\n"), /linear integration must contain only enabled=false/)
  assert.match(violations.join("\n"), /app is not allowed/)
  assert.match(violations.join("\n"), /\.env must be absent/)
  assert.match(violations.join("\n"), /\.env\.local must be absent/)
})

test("release check reports missing or malformed configuration without throwing", () => {
  const missing = mkdtempSync(join(tmpdir(), "release-state-missing-"))
  temporary.push(missing)
  assert.deepEqual(checkReleaseState(missing), [".cursor/harness.json must exist"])

  const malformed = fixture()
  writeFileSync(join(malformed, ".cursor", "harness.json"), "not json\n")
  assert.deepEqual(checkReleaseState(malformed), [
    ".cursor/harness.json must contain valid JSON",
  ])

  writeFileSync(join(malformed, ".cursor", "harness.json"), "null\n")
  assert.deepEqual(checkReleaseState(malformed), [
    ".cursor/harness.json must contain a JSON object",
  ])
})

test("release check permits only the explicit environment example", () => {
  const root = fixture()
  writeFileSync(join(root, ".env.example"), "DOCUMENTED_VALUE=example\n")
  assert.deepEqual(checkReleaseState(root), [])

  writeFileSync(join(root, ".env.production"), "PRODUCTION_SECRET=unsafe\n")
  assert.match(checkReleaseState(root).join("\n"), /\.env\.production must be absent/)
})

test("release check rejects arbitrary scaffold roots", () => {
  const root = fixture()
  for (const directory of ["pages", "public", "src"]) {
    mkdirSync(join(root, directory))
    writeFileSync(join(root, directory, "artifact.txt"), "generated\n")
  }
  const violations = checkReleaseState(root).join("\n")
  assert.match(violations, /pages is not allowed/)
  assert.match(violations, /public is not allowed/)
  assert.match(violations, /src is not allowed/)
})

test("release check scans supported nested credential locations", () => {
  const root = fixture()
  const nested = join(root, ".cursor", "nested")
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, ".env"), "SECRET=unsafe\n")
  writeFileSync(
    join(nested, ".npmrc"),
    "_authToken=unsafe\n//registry.example.test/:_auth=unsafe\n",
  )
  writeFileSync(join(nested, ".netrc"), "machine example.test password unsafe\n")

  const violations = checkReleaseState(root).join("\n")
  assert.match(violations, /\.cursor\/nested\/\.env must be absent/)
  assert.match(violations, /\.cursor\/nested\/\.npmrc must not contain credentials/)
  assert.match(violations, /\.cursor\/nested\/\.netrc credential file must be absent/)
})

test("release check rejects private-key material under allowed roots", () => {
  const root = fixture()
  mkdirSync(join(root, "docs"))
  const privateKeyMarker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ")
  writeFileSync(join(root, "docs", "deploy-key.pem"), `${privateKeyMarker}\nunsafe\n`)

  assert.match(
    checkReleaseState(root).join("\n"),
    /docs\/deploy-key\.pem must not contain private-key material/,
  )
})
