#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { versionAtLeast } from "./init.mjs"
import { migrationFingerprint } from "./verification.mjs"

function probe(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  })
  return {
    available: !result.error,
    ok: !result.error && result.status === 0,
    stdout: result.stdout || "",
  }
}

export function classifyDoctor(facts) {
  const checks = []
  const add = (id, status, message, remediation = null) =>
    checks.push({ id, status, message, remediation })

  const nodeOk = facts.nodeOk ?? facts.nodeMajor >= 20
  add(
    "node",
    nodeOk ? "pass" : "fail",
    nodeOk
      ? `Node.js ${facts.nodeVersion || facts.nodeMajor} is supported.`
      : `Node.js ${facts.nodeMinimum || "20.9.0"}+ is required.`,
    nodeOk ? null : `Install Node.js ${facts.nodeMinimum || "20.9.0"} or newer.`,
  )
  add(
    "pnpm",
    facts.pnpmOk ? "pass" : "fail",
    facts.pnpmOk ? `pnpm ${facts.pnpmVersion} is available.` : "pnpm is unavailable.",
    facts.pnpmOk ? null : "Enable Corepack and prepare pnpm 10.34.5.",
  )
  if (!facts.initialized) {
    add(
      "npx",
      facts.npxOk ? "pass" : "fail",
      facts.npxOk ? "npx is available for create-next-app." : "npx is unavailable.",
      facts.npxOk ? null : "Install npm with Node.js.",
    )
    add(
      "git",
      facts.gitClean ? "pass" : "fail",
      facts.gitClean ? "The bootstrap checkout is clean." : "The bootstrap checkout is dirty.",
      facts.gitClean ? null : "Commit or remove unrelated changes before /init.",
    )
  } else {
    add(
      "git",
      facts.gitClean ? "pass" : "warn",
      facts.gitClean ? "The working tree is clean." : "The initialized project has local changes.",
    )
  }
  add(
    "docker-binary",
    facts.dockerAvailable ? "pass" : "fail",
    facts.dockerAvailable ? "Docker CLI is available." : "Docker CLI is missing.",
    facts.dockerAvailable ? null : "Install Docker Desktop or Docker Engine.",
  )
  add(
    "docker-daemon",
    facts.dockerDaemon
      ? "pass"
      : facts.localSupabaseVerified
        ? "warn"
        : "fail",
    facts.dockerDaemon ? "Docker daemon is reachable." : "Docker daemon is unreachable.",
    facts.dockerDaemon
      ? null
      : "Start Docker, then run /verify-local on a Docker-capable host.",
  )
  add(
    "supabase-verification",
    facts.localSupabaseVerified ? "pass" : "fail",
    facts.localSupabaseVerified
      ? "Local Supabase verification is recorded."
      : "Local Supabase verification is pending.",
    facts.localSupabaseVerified ? null : "Run /verify-local after Docker is reachable.",
  )

  if (!facts.coderabbitEnabled) {
    add(
      "coderabbit",
      "warn",
      "CodeRabbit profile is disabled; core SDD/TDD remains available.",
      "Enable the profile during /init when CodeRabbit review is desired.",
    )
  } else if (!facts.coderabbitAvailable) {
    add(
      "coderabbit",
      "fail",
      "CodeRabbit profile is enabled but the CLI is missing.",
      "Install the CLI from the official CodeRabbit distribution.",
    )
  } else {
    add(
      "coderabbit",
      facts.coderabbitAuthenticated ? "pass" : "fail",
      facts.coderabbitAuthenticated
        ? "CodeRabbit CLI is authenticated."
        : "CodeRabbit CLI is not authenticated.",
      facts.coderabbitAuthenticated
        ? null
        : "In this web IDE, enable CodeRabbit from task actions and use runtime-managed authentication.",
    )
  }
  return checks
}

export function inspectEnvironment(root = process.cwd()) {
  const configPath = join(root, ".cursor", "harness.json")
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  const manifest = JSON.parse(
    readFileSync(join(root, ".cursor", "bootstrap", "manifest.json"), "utf8"),
  )
  const pnpm = probe("pnpm", ["--version"], root)
  const npx = probe("npx", ["--version"], root)
  const git = probe("git", ["status", "--porcelain"], root)
  const docker = probe("docker", ["info"], root)
  const coderabbit = probe("coderabbit", ["auth", "status", "--agent"], root)
  let coderabbitAuthenticated = false
  try {
    coderabbitAuthenticated = Boolean(JSON.parse(coderabbit.stdout).authenticated)
  } catch {
    coderabbitAuthenticated = false
  }
  const recordedFingerprint = config.project?.localSupabaseMigrationFingerprint
  const migrationsCurrent =
    typeof recordedFingerprint === "string" &&
    recordedFingerprint === migrationFingerprint(root)
  return {
    initialized: Boolean(config.initialized),
    nodeOk: versionAtLeast(process.versions.node, manifest.nodeMinimum),
    nodeVersion: process.versions.node,
    nodeMinimum: manifest.nodeMinimum,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    pnpmOk: pnpm.ok && pnpm.stdout.trim() === manifest.pnpmVersion,
    pnpmVersion: pnpm.stdout.trim(),
    npxOk: npx.ok,
    gitClean: git.ok && git.stdout.trim() === "",
    dockerAvailable: docker.available,
    dockerDaemon: docker.ok,
    localSupabaseVerified:
      Boolean(config.project?.localSupabaseVerified) && migrationsCurrent,
    coderabbitEnabled: Boolean(config.integrations?.coderabbit?.enabled),
    coderabbitAvailable: coderabbit.available,
    coderabbitAuthenticated,
  }
}

function render(checks) {
  const symbol = { pass: "PASS", warn: "WARN", fail: "FAIL" }
  return checks
    .map(
      (check) =>
        `[${symbol[check.status]}] ${check.id}: ${check.message}${
          check.remediation ? ` Recovery: ${check.remediation}` : ""
        }`,
    )
    .join("\n")
}

function main() {
  try {
    const checks = classifyDoctor(inspectEnvironment())
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ checks }, null, 2)}\n`)
    } else {
      process.stdout.write(`${render(checks)}\n`)
    }
    if (checks.some((check) => check.status === "fail")) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`doctor: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main()
}
