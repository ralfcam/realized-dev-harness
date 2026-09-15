import assert from "node:assert/strict"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import {
  executeLocalVerification,
  migrationFingerprint,
  parseConfiguredCommand,
  parseSupabaseEnvironment,
  runProcess,
  verifyInitializedProject,
} from "../bootstrap/verification.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function checkout(initialized = true) {
  const root = mkdtempSync(join(tmpdir(), "verify-local-test-"))
  temporary.push(root)
  mkdirSync(join(root, ".cursor"), { recursive: true })
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true })
  writeFileSync(join(root, "supabase", "migrations", "001_initial.sql"), "select 1;\n")
  writeFileSync(
    join(root, ".cursor", "harness.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        initialized,
        project: {
          name: "example",
          localSupabaseVerified: true,
          localSupabaseVerifiedAt: "2026-01-01T00:00:00.000Z",
          localSupabaseMigrationFingerprint: "stale",
        },
        commands: {
          integration: "pnpm test:integration",
          lint: "pnpm lint",
          typecheck: "pnpm typecheck",
          unit: "pnpm test:unit",
          harness: "pnpm test:harness",
          build: "pnpm build",
          e2e: "pnpm test:e2e",
        },
      },
      null,
      2,
    )}\n`,
  )
  return root
}

function successfulRunner(calls, observations = []) {
  return (command, args, _cwd, options = {}) => {
    calls.push(`${command} ${args.join(" ")}`)
    observations.push({ command, args: args.join(" "), capture: options.capture === true })
    if (args.join(" ") === "exec supabase status -o env") {
      return [
        'API_URL="http://127.0.0.1:54321"',
        'ANON_KEY="local-anon-value"',
        'SERVICE_ROLE_KEY="local-service-value"',
      ].join("\n")
    }
    return ""
  }
}

test("configured commands accept only one pnpm script", () => {
  assert.deepEqual(parseConfiguredCommand("pnpm test:unit"), {
    command: "pnpm",
    args: ["test:unit"],
  })
  assert.throws(() => parseConfiguredCommand("pnpm test:unit && echo unsafe"))
  assert.throws(() => parseConfiguredCommand("npm test"))
})

test("captured process failures never include command output", () => {
  assert.throws(
    () =>
      runProcess(
        process.execPath,
        [
          "-e",
          "process.stderr.write(['local', 'secret'].join('-')); process.exit(2)",
        ],
        process.cwd(),
        { capture: true },
      ),
    (error) => !error.message.includes("local-secret"),
  )
})

test("Supabase status must contain a loopback API URL", () => {
  assert.equal(
    parseSupabaseEnvironment(
      'API_URL="http://localhost:54321"\nANON_KEY="local"',
    ).ANON_KEY,
    "local",
  )
  assert.throws(
    () =>
      parseSupabaseEnvironment(
        'API_URL="https://project.supabase.co"\nANON_KEY="remote"',
      ),
    /non-loopback/,
  )
})

test("migration fingerprints bind verification to migration contents", () => {
  const root = checkout()
  const first = migrationFingerprint(root)
  writeFileSync(join(root, "supabase", "migrations", "001_initial.sql"), "select 2;\n")
  assert.notEqual(migrationFingerprint(root), first)
})

test("successful local verification runs every gate and records fresh evidence", async () => {
  const root = checkout()
  const calls = []
  const observations = []
  const verified = await verifyInitializedProject(root, {
    run: successfulRunner(calls, observations),
    now: () => new Date("2026-09-15T12:00:00.000Z"),
  })
  assert.equal(verified.project.localSupabaseVerified, true)
  assert.equal(
    verified.project.localSupabaseVerifiedAt,
    "2026-09-15T12:00:00.000Z",
  )
  for (const expected of [
    "docker info",
    "pnpm exec supabase start",
    "pnpm exec supabase db reset --local",
    "pnpm exec supabase db lint --local",
    "pnpm test:integration",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test:unit",
    "pnpm test:harness",
    "pnpm build",
    "pnpm test:e2e",
  ]) {
    assert.ok(calls.includes(expected), `missing call: ${expected}`)
  }
  const envPath = join(root, ".env.local")
  assert.equal(statSync(envPath).mode & 0o777, 0o600)
  assert.match(readFileSync(envPath, "utf8"), /local-service-value/)
  assert.doesNotMatch(calls.join("\n"), /local-(anon|service)-value/)
  assert.match(verified.project.localSupabaseMigrationFingerprint, /^[a-f0-9]{64}$/)
  for (const command of [
    "exec supabase start",
    "exec supabase db reset --local",
    "exec supabase status -o env",
    "exec supabase db lint --local",
  ]) {
    assert.equal(
      observations.find((item) => item.args === command)?.capture,
      true,
      `${command} must keep credentials out of terminal output`,
    )
  }
})

test("failed verification clears stale success and never records a new timestamp", async () => {
  const root = checkout()
  const run = (command, args) => {
    if (args.join(" ") === "exec supabase status -o env") {
      return 'API_URL="http://127.0.0.1:54321"\nANON_KEY="local"'
    }
    if (args[0] === "test:integration") throw new Error("integration failed")
    return ""
  }
  await assert.rejects(
    () =>
      executeLocalVerification(
        root,
        JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf8")),
        { run },
      ),
    /integration failed/,
  )
  const config = JSON.parse(
    readFileSync(join(root, ".cursor", "harness.json"), "utf8"),
  )
  assert.equal(config.project.localSupabaseVerified, false)
  assert.equal("localSupabaseVerifiedAt" in config.project, false)
  assert.equal("localSupabaseMigrationFingerprint" in config.project, false)
})

test("verification requires initialization and can be repeated safely", async () => {
  const uninitialized = checkout(false)
  await assert.rejects(
    () => verifyInitializedProject(uninitialized),
    /Run \/init/,
  )
  const root = checkout(true)
  const calls = []
  const dependencies = {
    run: successfulRunner(calls),
    now: () => new Date("2026-09-15T12:00:00.000Z"),
  }
  await verifyInitializedProject(root, dependencies)
  await verifyInitializedProject(root, dependencies)
  assert.equal(
    calls.filter((call) => call === "pnpm test:integration").length,
    2,
  )
})
