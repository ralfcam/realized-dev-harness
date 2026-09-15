import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, test } from "node:test"
import {
  assertMergeSafe,
  buildHarnessConfig,
  initialize,
  mergeTree,
  parseArgs,
  readBootstrapManifest,
  validateProjectName,
  versionAtLeast,
} from "../bootstrap/init.mjs"
import { verifyInitializedProject } from "../bootstrap/verification.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function temp() {
  const directory = mkdtempSync(join(tmpdir(), "harness-test-"))
  temporary.push(directory)
  return directory
}

function fixtureApp(directory) {
  mkdirSync(join(directory, "app"), { recursive: true })
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        private: true,
        scripts: { dev: "next dev", build: "next build", lint: "eslint ." },
        dependencies: {},
        devDependencies: {},
      },
      null,
      2,
    ),
  )
  writeFileSync(join(directory, ".gitignore"), "node_modules/\n")
  writeFileSync(join(directory, "README.md"), "# Upstream fixture\n")
  writeFileSync(join(directory, "app", "page.tsx"), "export default function Page() { return null }\n")
}

function harnessCheckout() {
  const root = temp()
  for (const entry of [".cursor", "docs", ".gitignore", "README.md", "package.json"]) {
    cpSync(join(process.cwd(), entry), join(root, entry), { recursive: true })
  }
  rmSync(join(root, ".cursor", "bootstrap-state.json"), { force: true })
  rmSync(join(root, ".cursor", "bootstrap-work"), { recursive: true, force: true })
  const configPath = join(root, ".cursor", "harness.json")
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        ...config,
        initialized: false,
        project: { name: null },
        integrations: {
          linear: { enabled: false },
          coderabbit: { enabled: false },
        },
      },
      null,
      2,
    )}\n`,
  )
  execFileSync("git", ["init", "-q"], { cwd: root })
  execFileSync("git", ["add", "."], { cwd: root })
  execFileSync(
    "git",
    ["-c", "user.name=Harness Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"],
    { cwd: root },
  )
  return root
}

function runner(command, args) {
  if (command === "git" && args.join(" ") === "status --porcelain") return ""
  if (command === "pnpm" && args.join(" ") === "exec supabase status -o env") {
    return 'API_URL="http://127.0.0.1:54321"\nANON_KEY="local-test-key"\n'
  }
  return ""
}

function dependencies(overrides = {}) {
  return {
    run: runner,
    commandAvailable: () => true,
    install: async () => {},
    ...overrides,
  }
}

function options(fixture, overrides = {}) {
  return {
    projectName: "example-app",
    withLinear: false,
    withCoderabbit: false,
    skipSupabaseStart: true,
    templateDir: fixture,
    ...overrides,
  }
}

test("argument parsing, runtime versions, and project validation are deterministic", () => {
  assert.deepEqual(
    parseArgs([
      "--project-name",
      "example",
      "--with-linear",
      "--linear-team-key",
      "ENG",
      "--with-coderabbit",
    ]),
    {
      projectName: "example",
      withCoderabbit: true,
      withLinear: true,
      linearTeamKey: "ENG",
      skipSupabaseStart: false,
    },
  )
  assert.throws(() => parseArgs(["--skip-install"]), /Unknown argument/)
  assert.throws(() => parseArgs(["--template-dir", "fixture"]), /Unknown argument/)
  assert.equal(validateProjectName("example-app"), "example-app")
  assert.throws(() => validateProjectName("Unsafe App"))
  assert.equal(versionAtLeast("20.9.0", "20.9.0"), true)
  assert.equal(versionAtLeast("20.8.9", "20.9.0"), false)
})

test("bootstrap manifest pins every executable input and records provenance", () => {
  const manifest = readBootstrapManifest()
  assert.equal(manifest.pnpmVersion, "10.34.5")
  for (const value of [manifest.template.version, ...Object.values(manifest.devDependencies)]) {
    assert.match(value, /^\d+\.\d+\.\d+/)
    assert.doesNotMatch(value, /latest|[~^*]/)
  }
  const config = buildHarnessConfig({
    projectName: "example",
    withLinear: false,
    withCoderabbit: false,
  })
  assert.equal(config.harnessVersion, manifest.harnessVersion)
  assert.equal(config.template.ref, manifest.template.ref)
})

test("all integration profile combinations produce only selected artifacts", async () => {
  for (const withLinear of [false, true]) {
    for (const withCoderabbit of [false, true]) {
      const root = harnessCheckout()
      const fixture = temp()
      fixtureApp(fixture)
      const config = await initialize(
        options(fixture, {
          withLinear,
          withCoderabbit,
          linearTeamKey: withLinear ? "ENG" : undefined,
        }),
        root,
        dependencies(),
      )
      assert.equal(config.integrations.linear.enabled, withLinear)
      assert.equal(config.integrations.coderabbit.enabled, withCoderabbit)
      assert.equal(existsSync(join(root, ".coderabbit.yaml")), withCoderabbit)
      assert.equal(
        existsSync(join(root, ".github", "workflows", "coderabbit-main-gate.yml")),
        withCoderabbit,
      )
      assert.equal(
        Boolean(JSON.parse(readFileSync(join(root, ".cursor", "settings.json"))).plugins.linear),
        withLinear,
      )
    }
  }
})

test("tree merge refuses collisions and safely resumes identical partial copies", () => {
  const source = temp()
  const destination = temp()
  writeFileSync(join(source, "package.json"), '{"name":"app"}\n')
  writeFileSync(join(destination, "package.json"), '{"name":"harness"}\n')
  mergeTree(source, destination)
  assert.match(readFileSync(join(destination, "package.json"), "utf8"), /app/)
  writeFileSync(join(source, "same.txt"), "same")
  writeFileSync(join(destination, "same.txt"), "same")
  assert.doesNotThrow(() => mergeTree(source, destination))
  writeFileSync(join(source, "unsafe.txt"), "new")
  writeFileSync(join(destination, "unsafe.txt"), "old")
  assert.throws(() => assertMergeSafe(source, destination), /Refusing to overwrite/)
  assert.throws(() => mergeTree(source, destination), /Refusing to overwrite/)
})

test("scaffold-only init can finish later with verified local evidence", async () => {
  const root = harnessCheckout()
  const fixture = temp()
  fixtureApp(fixture)
  const initOptions = options(fixture, {
    withLinear: true,
    linearTeamKey: "ENG",
    linearProject: "platform",
    withCoderabbit: true,
  })
  const config = await initialize(initOptions, root, dependencies())
  assert.equal(config.initialized, true)
  assert.equal(config.project.localSupabaseVerified, false)
  assert.ok(existsSync(join(root, "app", "page.tsx")))
  assert.ok(existsSync(join(root, "supabase", "config.toml")))
  assert.ok(existsSync(join(root, ".coderabbit.yaml")))
  assert.doesNotMatch(readFileSync(join(root, "docs", "product", "context.md"), "utf8"), /{{PROJECT_NAME}}/)

  const verified = await verifyInitializedProject(root, {
    now: () => new Date("2026-09-15T12:00:00.000Z"),
    run: runner,
  })
  assert.equal(verified.project.localSupabaseVerified, true)
  assert.equal(verified.project.localSupabaseVerifiedAt, "2026-09-15T12:00:00.000Z")
  assert.match(verified.project.localSupabaseMigrationFingerprint, /^[a-f0-9]{64}$/)
  await assert.rejects(() => initialize(initOptions, root, dependencies()), /already initialized/)
})

test("every persisted initialization phase is resumable", async () => {
  for (const phase of ["scaffolded", "merged", "installed", "configured", "verified", "complete"]) {
    const root = harnessCheckout()
    const fixture = temp()
    fixtureApp(fixture)
    const initOptions = options(fixture, { skipSupabaseStart: false })
    let interrupted = false
    await assert.rejects(
      () =>
        initialize(
          initOptions,
          root,
          dependencies({
            afterPhase(current) {
              if (!interrupted && current === phase) {
                interrupted = true
                throw new Error(`interrupted after ${phase}`)
              }
            },
          }),
        ),
      new RegExp(`interrupted after ${phase}`),
    )
    const state = JSON.parse(readFileSync(join(root, ".cursor", "bootstrap-state.json"), "utf8"))
    assert.equal(state.phase, phase)
    if (phase === "complete") {
      await assert.rejects(() => initialize(initOptions, root, dependencies()), /already initialized/)
    } else {
      const completed = await initialize(initOptions, root, dependencies())
      assert.equal(completed.initialized, true)
      assert.equal(completed.project.localSupabaseVerified, true)
    }
  }
})

test("resume rejects changed identity but permits scaffold-only recovery", async () => {
  const root = harnessCheckout()
  const fixture = temp()
  fixtureApp(fixture)
  const initial = options(fixture, { skipSupabaseStart: false })
  await assert.rejects(
    () =>
      initialize(
        initial,
        root,
        dependencies({ afterPhase: (phase) => phase === "configured" && Promise.reject(new Error("stop")) }),
      ),
    /stop/,
  )
  await assert.rejects(
    () => initialize({ ...initial, projectName: "different-app" }, root, dependencies()),
    /Resume arguments must match/,
  )
  const recovered = await initialize(
    { ...initial, skipSupabaseStart: true },
    root,
    dependencies(),
  )
  assert.equal(recovered.initialized, true)
  assert.equal(recovered.project.localSupabaseVerified, false)
})
