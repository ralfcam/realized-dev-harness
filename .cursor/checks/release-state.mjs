#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ALLOWED_ROOT_PATHS = new Set([
  ".cursor",
  ".env.example",
  ".git",
  ".gitignore",
  "LICENSE",
  "README.md",
  "docs",
  "node_modules",
  "package.json",
  "pnpm-lock.yaml",
])

const RUNTIME_PATHS = [
  ".cursor/bootstrap-state.json",
  ".cursor/bootstrap-work",
  ".cursor/hooks/state",
  ".cursor/upgrade-state.json",
]

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function containsMaterialPath(path) {
  if (!existsSync(path)) return false
  if (!statSync(path).isDirectory()) return true
  return readdirSync(path).some((name) => containsMaterialPath(join(path, name)))
}

function credentialViolations(root) {
  const violations = []
  const visit = (directory, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const rel = relative ? join(relative, entry.name) : entry.name
      if (!relative && [".git", "node_modules"].includes(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path, rel)
        continue
      }
      const normalized = rel.replaceAll("\\", "/")
      const contents = readFileSync(path, "utf8")
      if (/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/.test(contents)) {
        violations.push(`${normalized} must not contain private-key material`)
      }
      const envFile = entry.name === ".env" || entry.name.startsWith(".env.")
      if (envFile && normalized !== ".env.example") {
        violations.push(`${normalized} must be absent`)
      }
      if ([".netrc", "_netrc", ".git-credentials"].includes(entry.name)) {
        violations.push(`${normalized} credential file must be absent`)
      }
      if (entry.name === ".npmrc") {
        if (
          /^\s*(?:(?:\/\/[^\n=]+:)?(?:_auth|_authToken|_password|username))\s*=/im.test(
            contents,
          )
        ) {
          violations.push(`${normalized} must not contain credentials`)
        }
      }
      if (
        /(?:^|\/)\.config\/gh\/hosts\.yml$/.test(normalized) ||
        /(?:^|\/)\.docker\/config\.json$/.test(normalized) ||
        /(?:^|\/)\.aws\/credentials$/.test(normalized) ||
        /(?:^|\/)application_default_credentials\.json$/.test(normalized)
      ) {
        violations.push(`${normalized} credential file must be absent`)
      }
    }
  }
  visit(root)
  return violations
}

export function checkReleaseState(root) {
  const violations = []
  const configPath = join(root, ".cursor", "harness.json")
  if (!existsSync(configPath)) return [".cursor/harness.json must exist"]
  let config
  try {
    config = readJson(configPath)
  } catch {
    return [".cursor/harness.json must contain valid JSON"]
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [".cursor/harness.json must contain a JSON object"]
  }
  const project = config.project || {}

  if (config.initialized !== false) violations.push("config must have initialized=false")
  if (project.name !== null) violations.push("project.name must be null")
  for (const key of [
    "localSupabaseVerified",
    "localSupabaseVerifiedAt",
    "localSupabaseMigrationFingerprint",
  ]) {
    if (Object.hasOwn(project, key)) violations.push(`project.${key} must be absent`)
  }
  for (const integration of ["linear", "coderabbit"]) {
    const profile = config.integrations?.[integration]
    if (!profile || profile.enabled !== false || Object.keys(profile).length !== 1) {
      violations.push(`${integration} integration must contain only enabled=false`)
    }
  }
  for (const path of RUNTIME_PATHS) {
    if (containsMaterialPath(join(root, path))) violations.push(`${path} must be absent`)
  }
  for (const name of readdirSync(root)) {
    if (!ALLOWED_ROOT_PATHS.has(name) && containsMaterialPath(join(root, name))) {
      violations.push(`${name} is not allowed in the pre-init distribution`)
    }
  }
  violations.push(...credentialViolations(root))
  return violations
}

function main() {
  const violations = checkReleaseState(process.cwd())
  if (violations.length) {
    process.stderr.write(`${violations.map((item) => `release-state: ${item}`).join("\n")}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write("Harness release state is pre-init.\n")
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main()
