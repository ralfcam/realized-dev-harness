import { createHash } from "node:crypto"
import { chmodSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { spawnSync } from "node:child_process"
import { writeFileAtomic, writeJsonAtomic } from "./io.mjs"

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])
const FULL_CHECKS = [
  "integration",
  "lint",
  "typecheck",
  "unit",
  "harness",
  "build",
  "e2e",
]

export function runProcess(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: process.env,
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      `Command failed (${command} ${args.join(" ")}) with exit code ${result.status ?? "unavailable"}`,
    )
  }
  return result.stdout || ""
}

export function parseConfiguredCommand(command) {
  if (typeof command !== "string") throw new Error("Configured command must be a string.")
  const parts = command.trim().split(/\s+/)
  if (parts[0] !== "pnpm" || parts.length !== 2 || !/^[\w:-]+$/.test(parts[1])) {
    throw new Error(`Unsupported configured command: ${command}`)
  }
  return { command: parts[0], args: [parts[1]] }
}

export function parseSupabaseEnvironment(statusOutput) {
  const values = Object.fromEntries(
    String(statusOutput)
      .split("\n")
      .map((line) => /^([A-Z_]+)="?([^"\r\n]+)"?$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  )
  if (!values.API_URL || !values.ANON_KEY) {
    throw new Error("Could not resolve local Supabase API_URL and ANON_KEY.")
  }
  const url = new URL(values.API_URL)
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("Supabase verification refuses non-loopback API URLs.")
  }
  return values
}

export function serializeLocalEnvironment(values) {
  const lines = [
    `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${values.ANON_KEY}`,
  ]
  if (values.SERVICE_ROLE_KEY) {
    lines.push(`SUPABASE_SERVICE_ROLE_KEY=${values.SERVICE_ROLE_KEY}`)
  }
  return `${lines.join("\n")}\n`
}

function migrationFiles(directory, output = []) {
  if (!existsSync(directory)) return output
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) migrationFiles(path, output)
    else if (path.endsWith(".sql")) output.push(path)
  }
  return output
}

export function migrationFingerprint(root) {
  const migrations = join(root, "supabase", "migrations")
  const hash = createHash("sha256")
  for (const path of migrationFiles(migrations)) {
    hash.update(relative(migrations, path).replaceAll("\\", "/"))
    hash.update("\0")
    hash.update(readFileSync(path))
    hash.update("\0")
  }
  return hash.digest("hex")
}

export async function executeLocalVerification(
  root,
  config,
  { run = runProcess, now = () => new Date() } = {},
) {
  const configPath = join(root, ".cursor", "harness.json")
  const pending = {
    ...config,
    project: {
      ...config.project,
      localSupabaseVerified: false,
    },
  }
  delete pending.project.localSupabaseVerifiedAt
  delete pending.project.localSupabaseMigrationFingerprint
  writeJsonAtomic(configPath, pending)

  run("docker", ["info"], root, { capture: true })
  // Supabase's startup summary can contain local credentials. Keep it out of
  // terminal logs; runProcess also omits captured output from thrown errors.
  run("pnpm", ["exec", "supabase", "start"], root, { capture: true })
  run(
    "pnpm",
    ["exec", "supabase", "db", "reset", "--local"],
    root,
    { capture: true },
  )
  const status = run(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env"],
    root,
    { capture: true },
  )
  const values = parseSupabaseEnvironment(status)
  const envPath = join(root, ".env.local")
  writeFileAtomic(envPath, serializeLocalEnvironment(values), { mode: 0o600 })
  chmodSync(envPath, 0o600)
  run(
    "pnpm",
    ["exec", "supabase", "db", "lint", "--local"],
    root,
    { capture: true },
  )

  for (const key of FULL_CHECKS) {
    const parsed = parseConfiguredCommand(config.commands?.[key])
    run(parsed.command, parsed.args, root)
  }

  const verified = {
    ...pending,
    project: {
      ...pending.project,
      localSupabaseVerified: true,
      localSupabaseVerifiedAt: now().toISOString(),
      localSupabaseMigrationFingerprint: migrationFingerprint(root),
    },
  }
  writeJsonAtomic(configPath, verified)
  return verified
}

export async function verifyInitializedProject(root = process.cwd(), dependencies) {
  const configPath = join(root, ".cursor", "harness.json")
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  if (!config.initialized) {
    throw new Error("Run /init before /verify-local.")
  }
  return executeLocalVerification(root, config, dependencies)
}
