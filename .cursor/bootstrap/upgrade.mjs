#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { writeJsonAtomic } from "./io.mjs"

const REQUIRED_SCRIPTS = {
  "test:harness": "node --test .cursor/checks/*.test.mjs",
  "harness:doctor": "node .cursor/bootstrap/doctor.mjs",
  "verify:local": "node .cursor/bootstrap/verify-local.mjs",
  "work-item": "node .cursor/bootstrap/work-items.mjs",
  "harness:upgrade": "node .cursor/bootstrap/upgrade.mjs",
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function parseArgs(argv) {
  argv = argv.filter((arg) => arg !== "--")
  if (argv.some((arg) => !["--apply", "--dry-run"].includes(arg))) {
    throw new Error("Only --dry-run or --apply are supported.")
  }
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("Choose either --dry-run or --apply.")
  }
  return { apply: argv.includes("--apply") }
}

export function planUpgrade(root) {
  const manifest = readJson(join(root, ".cursor", "bootstrap", "manifest.json"))
  const configPath = join(root, ".cursor", "harness.json")
  const packagePath = join(root, "package.json")
  const config = readJson(configPath)
  const pkg = readJson(packagePath)
  if (config.schemaVersion !== 1) {
    throw new Error(`Unsupported harness schemaVersion: ${config.schemaVersion}`)
  }
  const collisions = []
  const packageManager = `pnpm@${manifest.pnpmVersion}`
  if (pkg.packageManager && pkg.packageManager !== packageManager) {
    collisions.push("packageManager")
  }
  for (const [name, command] of Object.entries(REQUIRED_SCRIPTS)) {
    if (pkg.scripts?.[name] && pkg.scripts[name] !== command) collisions.push(`scripts.${name}`)
  }
  const nextConfig = {
    ...config,
    harnessVersion: manifest.harnessVersion,
    runtime: {
      nodeMinimum: manifest.nodeMinimum,
      pnpmVersion: manifest.pnpmVersion,
    },
    template: config.template || {
      repository: manifest.template.repository,
      ref: manifest.template.ref,
      example: manifest.template.example,
      generator: `${manifest.template.package}@${manifest.template.version}`,
    },
  }
  const nextPackage = {
    ...pkg,
    packageManager,
    scripts: { ...pkg.scripts, ...REQUIRED_SCRIPTS },
    devDependencies: {
      ...pkg.devDependencies,
      yaml: manifest.devDependencies.yaml,
    },
  }
  const changes = []
  if (JSON.stringify(config) !== JSON.stringify(nextConfig)) changes.push(".cursor/harness.json")
  if (JSON.stringify(pkg) !== JSON.stringify(nextPackage)) changes.push("package.json")
  return {
    fromVersion: config.harnessVersion || "0.1.0",
    toVersion: manifest.harnessVersion,
    collisions,
    changes,
    files: { configPath, packagePath },
    next: { config: nextConfig, package: nextPackage },
    current: { config, package: pkg },
  }
}

export function applyUpgrade(root, { write = writeJsonAtomic } = {}) {
  const plan = planUpgrade(root)
  if (plan.collisions.length) {
    throw new Error(`Upgrade collisions: ${plan.collisions.join(", ")}`)
  }
  if (!plan.changes.length) return { ...plan, applied: false }
  const statePath = join(root, ".cursor", "upgrade-state.json")
  write(statePath, {
    schemaVersion: 1,
    phase: "applying",
    fromVersion: plan.fromVersion,
    toVersion: plan.toVersion,
    backup: plan.current,
  })
  try {
    write(plan.files.configPath, plan.next.config)
    write(plan.files.packagePath, plan.next.package)
    write(statePath, {
      schemaVersion: 1,
      phase: "complete",
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      changed: plan.changes,
    })
    return { ...plan, applied: true }
  } catch (error) {
    write(plan.files.configPath, plan.current.config)
    write(plan.files.packagePath, plan.current.package)
    write(statePath, {
      schemaVersion: 1,
      phase: "rolled_back",
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      error: error.message,
    })
    throw error
  }
}

function printable(plan, apply) {
  return {
    mode: apply ? "apply" : "dry-run",
    fromVersion: plan.fromVersion,
    toVersion: plan.toVersion,
    collisions: plan.collisions,
    changes: plan.changes,
    ...(apply ? { applied: plan.applied } : {}),
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const plan = options.apply ? applyUpgrade(process.cwd()) : planUpgrade(process.cwd())
    process.stdout.write(`${JSON.stringify(printable(plan, options.apply), null, 2)}\n`)
    if (plan.collisions.length) process.exitCode = 2
  } catch (error) {
    process.stderr.write(`upgrade-harness: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main()
