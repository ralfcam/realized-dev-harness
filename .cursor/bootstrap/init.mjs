#!/usr/bin/env node
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { writeFileAtomic, writeJsonAtomic } from "./io.mjs"
import { executeLocalVerification, parseConfiguredCommand } from "./verification.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const PHASES = [
  "scaffolded",
  "merged",
  "installed",
  "configured",
  "verified",
  "complete",
]
const BOOTSTRAP_OWNED = new Set([
  ".gitignore",
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
])

export function readBootstrapManifest() {
  return JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"))
}

export function parseArgs(argv) {
  const out = {
    withCoderabbit: false,
    withLinear: false,
    skipSupabaseStart: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--with-coderabbit") out.withCoderabbit = true
    else if (arg === "--with-linear") out.withLinear = true
    else if (arg === "--skip-supabase-start") out.skipSupabaseStart = true
    else if (["--project-name", "--linear-team-key", "--linear-project"].includes(arg)) {
      if (!argv[i + 1]) throw new Error(`${arg} requires a value`)
      const key = {
        "--project-name": "projectName",
        "--linear-team-key": "linearTeamKey",
        "--linear-project": "linearProject",
      }[arg]
      out[key] = argv[i + 1]
      i += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return out
}

export function validateProjectName(name) {
  if (
    typeof name !== "string" ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(name) ||
    name.length > 214
  ) {
    throw new Error(
      "Project name must be a lowercase npm-compatible name (letters, numbers, ., _, -).",
    )
  }
  return name
}

function versionParts(value) {
  return String(value)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0)
}

export function versionAtLeast(actual, minimum) {
  const left = versionParts(actual)
  const right = versionParts(minimum)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true
    if ((left[index] || 0) < (right[index] || 0)) return false
  }
  return true
}

export function buildHarnessConfig(options, verified = false, manifest = readBootstrapManifest()) {
  const linear = { enabled: options.withLinear }
  if (options.withLinear) {
    linear.teamKey = options.linearTeamKey
    if (options.linearProject) linear.project = options.linearProject
  }
  return {
    schemaVersion: 1,
    harnessVersion: manifest.harnessVersion,
    initialized: true,
    project: {
      name: options.projectName,
      localSupabaseVerified: verified,
    },
    template: {
      repository: manifest.template.repository,
      ref: manifest.template.ref,
      example: manifest.template.example,
      generator: `${manifest.template.package}@${manifest.template.version}`,
    },
    runtime: {
      nodeMinimum: manifest.nodeMinimum,
      pnpmVersion: manifest.pnpmVersion,
    },
    packageManager: "pnpm",
    commands: {
      lint: "pnpm lint",
      typecheck: "pnpm typecheck",
      unit: "pnpm test:unit",
      integration: "pnpm test:integration",
      e2e: "pnpm test:e2e",
      build: "pnpm build",
      harness: "pnpm test:harness",
    },
    git: {
      defaultBranch: "main",
      accumulatorBranch: "staging",
      featurePrefix: "sdd/",
    },
    docs: { root: "docs", okfVersion: "0.2" },
    dispatch: { minimumActive: 1, maximumActive: 3 },
    integrations: {
      linear,
      coderabbit: { enabled: options.withCoderabbit },
    },
  }
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: process.env,
  })
  if (result.error || result.status !== 0) {
    const detail = options.capture ? (result.stderr || result.stdout || "").trim() : ""
    throw new Error(
      `Command failed (${command} ${args.join(" ")})${detail ? `: ${detail}` : ""}`,
    )
  }
  return result.stdout || ""
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" })
  return !result.error && result.status === 0
}

function phaseIndex(phase) {
  return PHASES.indexOf(phase)
}

function optionsIdentity(options, manifest) {
  const identity = {
    projectName: options.projectName,
    withLinear: Boolean(options.withLinear),
    linearTeamKey: options.withLinear ? options.linearTeamKey : null,
    linearProject: options.withLinear ? options.linearProject || null : null,
    withCoderabbit: Boolean(options.withCoderabbit),
    template: options.templateDir
      ? { fixture: resolve(options.templateDir) }
      : manifest.template,
  }
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex")
}

function stateFor(phase, options, optionsHash) {
  return {
    schemaVersion: 1,
    phase,
    optionsHash,
    projectName: options.projectName,
    integrations: {
      linear: {
        enabled: Boolean(options.withLinear),
        ...(options.withLinear ? { teamKey: options.linearTeamKey } : {}),
        ...(options.linearProject ? { project: options.linearProject } : {}),
      },
      coderabbit: { enabled: Boolean(options.withCoderabbit) },
    },
  }
}

function preflight(
  root,
  options,
  state,
  manifest,
  { execute = run, commandAvailable = commandExists } = {},
) {
  const current = JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf8"))
  if (current.initialized || state?.phase === "complete") {
    throw new Error("This repository is already initialized; refusing to overwrite it.")
  }
  validateProjectName(options.projectName)
  if (options.withLinear && !options.linearTeamKey) {
    throw new Error("--with-linear requires --linear-team-key.")
  }
  if (!versionAtLeast(process.versions.node, manifest.nodeMinimum)) {
    throw new Error(`Node.js ${manifest.nodeMinimum} or newer is required.`)
  }
  if (!commandAvailable("pnpm")) throw new Error("pnpm is required.")
  if (!options.templateDir && !commandAvailable("npx")) throw new Error("npx is required.")
  if (!state && !options.skipSupabaseStart && !commandAvailable("docker", ["info"])) {
    throw new Error(
      "Docker must be installed and running to start local Supabase. Use --skip-supabase-start only for an explicit scaffold-only recovery.",
    )
  }
  if (state) return
  const status = execute("git", ["status", "--porcelain"], root, { capture: true }).trim()
  if (status) throw new Error("The working tree must be clean before /init.")
  const allowed = new Set([
    ".cursor",
    ".git",
    ".gitignore",
    ".github",
    "LICENSE",
    "README.md",
    "docs",
    "package.json",
    "pnpm-lock.yaml",
  ])
  const collisions = readdirSync(root).filter((entry) => !allowed.has(entry))
  if (collisions.length) {
    throw new Error(`Target contains non-harness files: ${collisions.join(", ")}`)
  }
}

function writeGeneratedFiles(app, projectName, manifest) {
  const packagePath = join(app, "package.json")
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"))
  pkg.name = projectName
  pkg.type = "module"
  pkg.packageManager = `pnpm@${manifest.pnpmVersion}`
  pkg.scripts = {
    ...pkg.scripts,
    typecheck: "tsc --noEmit",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:harness": "node --test .cursor/checks/*.test.mjs",
    "harness:doctor": "node .cursor/bootstrap/doctor.mjs",
    "verify:local": "node .cursor/bootstrap/verify-local.mjs",
    "work-item": "node .cursor/bootstrap/work-items.mjs",
    "harness:upgrade": "node .cursor/bootstrap/upgrade.mjs",
  }
  pkg.devDependencies = { ...pkg.devDependencies, ...manifest.devDependencies }
  writeJsonAtomic(packagePath, pkg)
  const tailwindConfig = join(app, "tailwind.config.ts")
  if (existsSync(tailwindConfig)) {
    const source = readFileSync(tailwindConfig, "utf8")
    if (source.includes('require("tailwindcss-animate")')) {
      writeFileAtomic(
        tailwindConfig,
        `import tailwindcssAnimate from "tailwindcss-animate"\n${source.replace(
          'require("tailwindcss-animate")',
          "tailwindcssAnimate",
        )}`,
      )
    }
  }
  writeFileAtomic(
    join(app, "vitest.config.ts"),
    `import { defineConfig } from "vitest/config"\n\nexport default defineConfig({\n  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"] },\n})\n`,
  )
  writeFileAtomic(join(app, "vitest.setup.ts"), `import "@testing-library/jest-dom/vitest"\n`)
  writeFileAtomic(
    join(app, "playwright.config.ts"),
    `import { defineConfig } from "@playwright/test"\n\nexport default defineConfig({\n  testDir: "./tests/e2e",\n  use: { baseURL: "http://127.0.0.1:3000" },\n  webServer: { command: "pnpm dev", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI },\n})\n`,
  )
  mkdirSync(join(app, "tests", "unit"), { recursive: true })
  mkdirSync(join(app, "tests", "integration"), { recursive: true })
  mkdirSync(join(app, "tests", "e2e"), { recursive: true })
  writeFileAtomic(
    join(app, "tests", "unit", "bootstrap.test.ts"),
    `import { describe, expect, it } from "vitest"\n\ndescribe("bootstrap", () => {\n  it("runs the unit test layer", () => expect(true).toBe(true))\n})\n`,
  )
  writeFileAtomic(
    join(app, "tests", "integration", "supabase-health.test.ts"),
    `import { describe, expect, it } from "vitest"\n\ndescribe("local Supabase", () => {\n  it("serves Auth and REST from loopback", async () => {\n    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"\n    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\n    const url = new URL(base)\n    expect(["127.0.0.1", "localhost", "::1"]).toContain(url.hostname)\n    const auth = await fetch(new URL("/auth/v1/health", url))\n    expect(auth.ok).toBe(true)\n    const rest = await fetch(new URL("/rest/v1/", url), {\n      headers: key ? { apikey: key } : {},\n    })\n    expect(rest.ok).toBe(true)\n  })\n})\n`,
  )
  writeFileAtomic(
    join(app, "tests", "e2e", "home.spec.ts"),
    `import { expect, test } from "@playwright/test"\n\ntest("renders the application", async ({ page }) => {\n  await page.goto("/")\n  await expect(page.locator("body")).toBeVisible()\n})\n`,
  )
}

function ensureSupabaseConfig(app, projectName) {
  const configPath = join(app, "supabase", "config.toml")
  if (existsSync(configPath)) {
    const config = readFileSync(configPath, "utf8")
    writeFileAtomic(
      configPath,
      /^project_id\s*=.*$/m.test(config)
        ? config.replace(/^project_id\s*=.*$/m, `project_id = "${projectName}"`)
        : `project_id = "${projectName}"\n${config}`,
    )
  } else {
    writeFileAtomic(
      configPath,
      `project_id = "${projectName}"\n\n[api]\nenabled = true\nport = 54321\nschemas = ["public", "graphql_public"]\n\n[db]\nport = 54322\nmajor_version = 17\n\n[db.seed]\nenabled = true\nsql_paths = ["./seed.sql"]\n`,
    )
  }
  const seed = join(app, "supabase", "seed.sql")
  if (!existsSync(seed)) writeFileAtomic(seed, "-- Add deterministic local seed data here.\n")
  mkdirSync(join(app, "supabase", "migrations"), { recursive: true })
}

function mergeGitignore(root, staged) {
  const destination = join(root, ".gitignore")
  const parts = []
  for (const path of [destination, join(staged, ".gitignore")]) {
    if (existsSync(path)) parts.push(readFileSync(path, "utf8").trim())
  }
  const lines = [...new Set(parts.join("\n").split("\n").filter(Boolean))]
  writeFileAtomic(destination, `${lines.join("\n")}\n`)
}

function filesEqual(left, right) {
  return readFileSync(left).equals(readFileSync(right))
}

export function mergeTree(source, destination, relative = "") {
  for (const name of readdirSync(source)) {
    if (
      name === ".git" ||
      name === "node_modules" ||
      name === ".next" ||
      (relative === "" && name === ".gitignore")
    ) continue
    const from = join(source, name)
    const rel = relative ? join(relative, name) : name
    const to = join(destination, rel)
    if (statSync(from).isDirectory()) {
      if (existsSync(to) && !statSync(to).isDirectory()) {
        throw new Error(`Cannot merge directory over file: ${rel}`)
      }
      mkdirSync(to, { recursive: true })
      mergeTree(from, destination, rel)
    } else if (existsSync(to) && !BOOTSTRAP_OWNED.has(rel) && !filesEqual(from, to)) {
      throw new Error(`Refusing to overwrite existing file: ${rel}`)
    } else if (!existsSync(to) || BOOTSTRAP_OWNED.has(rel)) {
      mkdirSync(dirname(to), { recursive: true })
      cpSync(from, to)
    }
  }
}

export function assertMergeSafe(source, destination, relative = "") {
  for (const name of readdirSync(source)) {
    if (
      name === ".git" ||
      name === "node_modules" ||
      name === ".next" ||
      (relative === "" && name === ".gitignore")
    ) continue
    const from = join(source, name)
    const rel = relative ? join(relative, name) : name
    const to = join(destination, rel)
    if (statSync(from).isDirectory()) {
      if (existsSync(to) && !statSync(to).isDirectory()) {
        throw new Error(`Cannot merge directory over file: ${rel}`)
      }
      assertMergeSafe(from, destination, rel)
    } else if (existsSync(to) && !BOOTSTRAP_OWNED.has(rel) && !filesEqual(from, to)) {
      throw new Error(`Refusing to overwrite existing file: ${rel}`)
    }
  }
}

function renderDocs(root, projectName) {
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) visit(path)
      else if (path.endsWith(".md")) {
        const rendered = readFileSync(path, "utf8")
          .replaceAll("{{PROJECT_NAME}}", projectName)
          .replaceAll(
            "2026-09-15T00:00:00Z",
            new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
          )
        writeFileAtomic(path, rendered)
      }
    }
  }
  visit(join(root, "docs"))
}

function installProfiles(root, options, config) {
  const settingsPath = join(root, ".cursor", "settings.json")
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"))
  settings.plugins = {
    ...settings.plugins,
    ...(options.withLinear ? { linear: { enabled: true } } : {}),
  }
  writeJsonAtomic(settingsPath, settings)
  if (options.withCoderabbit) {
    cpSync(
      join(root, ".cursor", "profiles", "coderabbit", "coderabbit.yaml"),
      join(root, ".coderabbit.yaml"),
    )
    const workflow = join(root, ".github", "workflows", "coderabbit-main-gate.yml")
    writeFileAtomic(
      workflow,
      readFileSync(
        join(root, ".cursor", "profiles", "coderabbit", "coderabbit-main-gate.yml"),
        "utf8",
      )
        .replaceAll("{{DEFAULT_BRANCH}}", config.git.defaultBranch)
        .replaceAll("{{ACCUMULATOR_BRANCH}}", config.git.accumulatorBranch),
    )
  }
}

async function defaultInstall(root, execute) {
  execute("pnpm", ["install"], root)
  execute("pnpm", ["exec", "playwright", "install", "chromium"], root)
}

function scaffoldTemplate(root, stagedApp, options, manifest, execute) {
  rmSync(stagedApp, { recursive: true, force: true })
  mkdirSync(dirname(stagedApp), { recursive: true })
  if (options.templateDir) {
    cpSync(resolve(options.templateDir), stagedApp, { recursive: true })
  } else {
    const example = `${manifest.template.repository}/tree/${manifest.template.ref}/${manifest.template.example}`
    execute(
      "npx",
      [
        "--yes",
        `${manifest.template.package}@${manifest.template.version}`,
        stagedApp,
        "--example",
        example,
        "--use-pnpm",
        "--disable-git",
        "--skip-install",
      ],
      root,
    )
  }
  writeGeneratedFiles(stagedApp, options.projectName, manifest)
  ensureSupabaseConfig(stagedApp, options.projectName)
}

export async function initialize(options, root = process.cwd(), dependencies = {}) {
  options = {
    withCoderabbit: false,
    withLinear: false,
    skipSupabaseStart: false,
    ...options,
  }
  options.projectName = validateProjectName(options.projectName)
  const manifest = dependencies.manifest || readBootstrapManifest()
  const execute = dependencies.run || run
  const install = dependencies.install || defaultInstall
  const afterPhase = dependencies.afterPhase || (() => {})
  const statePath = join(root, ".cursor", "bootstrap-state.json")
  const workRoot = join(root, ".cursor", "bootstrap-work")
  const stagedApp = join(workRoot, "app")
  let state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : null
  const optionsHash = optionsIdentity(options, manifest)

  if (state && state.optionsHash !== optionsHash) {
    throw new Error("Resume arguments must match the interrupted initialization.")
  }
  preflight(root, options, state, manifest, {
    execute,
    commandAvailable: dependencies.commandAvailable || commandExists,
  })

  const persist = async (phase) => {
    state = stateFor(phase, options, optionsHash)
    writeJsonAtomic(statePath, state)
    await afterPhase(phase)
  }
  const before = (phase) => !state || phaseIndex(state.phase) < phaseIndex(phase)

  if (before("scaffolded")) {
    scaffoldTemplate(root, stagedApp, options, manifest, execute)
    await persist("scaffolded")
  } else if (state.phase === "scaffolded" && !existsSync(stagedApp)) {
    scaffoldTemplate(root, stagedApp, options, manifest, execute)
    await persist("scaffolded")
  }

  if (before("merged")) {
    assertMergeSafe(stagedApp, root)
    mergeGitignore(root, stagedApp)
    mergeTree(stagedApp, root)
    await persist("merged")
  }
  if (phaseIndex(state.phase) >= phaseIndex("merged")) {
    rmSync(workRoot, { recursive: true, force: true })
  }

  if (before("installed")) {
    await install(root, execute)
    await persist("installed")
  }

  if (before("configured")) {
    const pendingConfig = {
      ...buildHarnessConfig(options, false, manifest),
      initialized: false,
    }
    installProfiles(root, options, pendingConfig)
    renderDocs(root, options.projectName)
    writeJsonAtomic(join(root, ".cursor", "harness.json"), pendingConfig)
    await persist("configured")
  }

  if (!options.skipSupabaseStart && before("verified")) {
    const pendingConfig = JSON.parse(
      readFileSync(join(root, ".cursor", "harness.json"), "utf8"),
    )
    await executeLocalVerification(root, pendingConfig, { run: execute })
    await persist("verified")
  }

  if (options.skipSupabaseStart && before("complete")) {
    const pendingConfig = JSON.parse(
      readFileSync(join(root, ".cursor", "harness.json"), "utf8"),
    )
    for (const key of ["lint", "typecheck", "unit", "harness"]) {
      const parsed = parseConfiguredCommand(pendingConfig.commands[key])
      execute(parsed.command, parsed.args, root)
    }
  }

  if (before("complete")) {
    const configPath = join(root, ".cursor", "harness.json")
    const completedConfig = {
      ...JSON.parse(readFileSync(configPath, "utf8")),
      initialized: true,
    }
    writeJsonAtomic(configPath, completedConfig)
    await persist("complete")
  }

  return JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf8"))
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (!options.projectName) throw new Error("--project-name is required.")
    const config = await initialize(options)
    process.stdout.write(
      `Initialized ${config.project.name}; Linear=${config.integrations.linear.enabled}, CodeRabbit=${config.integrations.coderabbit.enabled}, local Supabase verified=${config.project.localSupabaseVerified}.\n`,
    )
    if (!config.project.localSupabaseVerified) {
      process.stdout.write(
        "Scaffold-only initialization completed. Start Docker, then run /verify-local.\n",
      )
    }
  } catch (error) {
    process.stderr.write(`init: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  await main()
}
