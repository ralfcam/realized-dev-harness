#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const ROOT = process.cwd()
const DOCS_ROOT = join(ROOT, "docs")
const ALLOWED_STATUS = new Set(["draft", "stable", "deprecated"])
const WORKFLOW_STATES = new Set([
  "triage",
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
  "canceled",
])
const PRIORITIES = new Set(["critical", "high", "medium", "low"])
const FORBIDDEN = [
  /restaurant-system/i,
  /ralfcam/i,
  /team_MP[\w-]*/i,
  /prj_[\w-]*/i,
  /\bRES-\d+/i,
  /PycharmProjects/i,
]
const ACTOR = /^(?:human:[^\s]+|process:[^\s]+|[^:\s/]+\/[^\s/]+)$/

function walk(directory, predicate, output = []) {
  if (!existsSync(directory)) return output
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) walk(path, predicate, output)
    else if (predicate(path)) output.push(path)
  }
  return output
}

function splitFrontmatter(text) {
  if (!text.startsWith("---\n")) return { data: null, body: text, error: null }
  const end = text.indexOf("\n---\n", 4)
  if (end === -1) return { data: null, body: text, error: "unclosed frontmatter" }
  try {
    const data = parseYaml(text.slice(4, end))
    return { data, body: text.slice(end + 5), error: null }
  } catch (error) {
    return { data: null, body: text.slice(end + 5), error: error.message }
  }
}

function validTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

function markdownLinks(text) {
  return [...text.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1])
}

function resolveInternalLink(fromPath, href) {
  const clean = href.split("#")[0].split("?")[0]
  if (!clean || /^(?:https?:|mailto:)/.test(clean)) return null
  const target = clean.startsWith("/")
    ? join(DOCS_ROOT, clean.slice(1))
    : resolve(dirname(fromPath), clean)
  const normalized = resolve(target)
  const fromRoot = relative(DOCS_ROOT, normalized)
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) return normalized
  if (existsSync(normalized) && statSync(normalized).isDirectory()) {
    return join(normalized, "index.md")
  }
  return normalized
}

function insideBundle(path) {
  const fromRoot = relative(DOCS_ROOT, path)
  return !fromRoot.startsWith("..") && !isAbsolute(fromRoot)
}

function validateActor(value, label, violations) {
  if (typeof value !== "string" || !ACTOR.test(value)) {
    violations.push(`${label}: invalid actor`)
  }
}

function validateTrust(path, data, violations) {
  const rel = relative(ROOT, path)
  if (data.generated !== undefined) {
    if (!data.generated || typeof data.generated !== "object" || Array.isArray(data.generated)) {
      violations.push(`${rel}: generated must be a mapping`)
    } else {
      validateActor(data.generated.by, `${rel}: generated.by`, violations)
      if (data.generated.at !== undefined && !validTimestamp(data.generated.at)) {
        violations.push(`${rel}: generated.at must be an ISO 8601 timestamp with offset`)
      }
    }
  }
  if (data.verified !== undefined) {
    const entries = Array.isArray(data.verified) ? data.verified : [data.verified]
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object") {
        violations.push(`${rel}: verified[${index}] must be a mapping`)
        continue
      }
      validateActor(entry.by, `${rel}: verified[${index}].by`, violations)
      if (!validTimestamp(entry.at)) {
        violations.push(`${rel}: verified[${index}].at must be an ISO 8601 timestamp with offset`)
      }
    }
  }
  if (data.stale_after !== undefined && !validTimestamp(data.stale_after)) {
    violations.push(`${rel}: stale_after must be an ISO 8601 timestamp with offset`)
  }
  if (data.sources !== undefined) {
    if (!Array.isArray(data.sources)) {
      violations.push(`${rel}: sources must be a list`)
    } else {
      for (const [index, source] of data.sources.entries()) {
        if (!source || typeof source.resource !== "string" || !source.resource.trim()) {
          violations.push(`${rel}: sources[${index}].resource is required`)
        }
        if (
          typeof source?.resource === "string" &&
          (source.resource.startsWith("/") || source.resource.startsWith("."))
        ) {
          const target = resolveInternalLink(path, source.resource)
          if (!target || !insideBundle(target) || !existsSync(target)) {
            violations.push(`${rel}: sources[${index}].resource is broken`)
          }
        }
        if (source?.last_modified !== undefined && !validTimestamp(source.last_modified)) {
          violations.push(`${rel}: sources[${index}].last_modified must be an ISO timestamp`)
        }
      }
    }
  }
}

function checkConfig(violations) {
  const config = JSON.parse(readFileSync(join(ROOT, ".cursor", "harness.json"), "utf8"))
  const manifest = JSON.parse(
    readFileSync(join(ROOT, ".cursor", "bootstrap", "manifest.json"), "utf8"),
  )
  if (config.schemaVersion !== 1) violations.push("config: schemaVersion must be 1")
  if (config.harnessVersion !== manifest.harnessVersion) {
    violations.push("config: harnessVersion must match the bootstrap manifest")
  }
  if (config.packageManager !== "pnpm") violations.push("config: packageManager must be pnpm")
  if (config.docs?.okfVersion !== "0.2") violations.push("config: OKF must be 0.2")
  if (config.template?.ref !== manifest.template.ref) {
    violations.push("config: template provenance must match the bootstrap manifest")
  }
  const { minimumActive, maximumActive } = config.dispatch || {}
  if (minimumActive !== 1 || maximumActive !== 3) {
    violations.push("config: dispatch defaults must be 1-3")
  }
  for (const integration of ["linear", "coderabbit"]) {
    if (typeof config.integrations?.[integration]?.enabled !== "boolean") {
      violations.push(`config: ${integration}.enabled must be boolean`)
    }
  }
  for (const version of [
    manifest.template.version,
    manifest.nodeMinimum,
    manifest.pnpmVersion,
    ...Object.values(manifest.devDependencies),
  ]) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      violations.push(`manifest: dependency version must be exact: ${version}`)
    }
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  if (config.project?.name === null && pkg.version !== manifest.harnessVersion) {
    violations.push("package: version must match the bootstrap manifest")
  }
  for (const script of ["harness:doctor", "verify:local", "work-item", "harness:upgrade"]) {
    if (!pkg.scripts?.[script]) violations.push(`package: missing ${script}`)
  }
  for (const path of walk(join(ROOT, ".cursor", "bootstrap"), (file) => file.endsWith(".mjs"))) {
    if (/@latest|["']latest["']/.test(readFileSync(path, "utf8"))) {
      violations.push(`${relative(ROOT, path)}: executable floating version is forbidden`)
    }
  }
}

function checkDocs(violations) {
  const paths = walk(DOCS_ROOT, (file) => file.endsWith(".md"))
  const parsed = new Map()
  for (const path of paths) {
    const rel = relative(ROOT, path)
    const text = readFileSync(path, "utf8")
    const document = splitFrontmatter(text)
    parsed.set(path, { ...document, text })
    if (document.error) violations.push(`${rel}: ${document.error}`)
    const name = path.split(/[\\/]/).at(-1)
    if (name === "index.md") {
      if (path === join(DOCS_ROOT, "index.md")) {
        if (document.data?.okf_version !== "0.2") {
          violations.push(`${rel}: root index must declare okf_version 0.2`)
        }
      } else if (document.data) {
        violations.push(`${rel}: nested index must not have frontmatter`)
      }
    } else if (name === "log.md") {
      if (document.data) violations.push(`${rel}: log must not have frontmatter`)
      if (!/^## \d{4}-\d{2}-\d{2}$/m.test(text)) {
        violations.push(`${rel}: log needs ISO date headings`)
      }
    } else {
      const data = document.data
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        violations.push(`${rel}: missing YAML frontmatter`)
      } else {
        if (typeof data.type !== "string" || !data.type.trim()) {
          violations.push(`${rel}: missing type`)
        }
        if (data.status && !ALLOWED_STATUS.has(data.status)) {
          violations.push(`${rel}: invalid OKF status ${data.status}`)
        }
        validateTrust(path, data, violations)
      }
    }
    for (const href of markdownLinks(document.body)) {
      const target = resolveInternalLink(path, href)
      if (target && (!insideBundle(target) || !existsSync(target))) {
        violations.push(`${rel}: broken link ${href}`)
      }
    }
  }

  for (const [path, document] of parsed) {
    if (document.data?.type !== "Work Item") continue
    const rel = relative(ROOT, path)
    if (!WORKFLOW_STATES.has(document.data.workflow_state)) {
      violations.push(`${rel}: invalid or missing workflow_state`)
    }
    if (!PRIORITIES.has(document.data.priority)) {
      violations.push(`${rel}: invalid or missing priority`)
    }
    if (typeof document.data.spec !== "string") {
      violations.push(`${rel}: spec is required`)
      continue
    }
    const target = resolveInternalLink(path, document.data.spec)
    const spec = target ? parsed.get(target) : null
    if (!spec) violations.push(`${rel}: specification does not exist`)
    else if (spec.data?.type !== "Specification") {
      violations.push(`${rel}: spec must link to a concept with type Specification`)
    }
  }

  const reachable = new Set()
  const queue = [join(DOCS_ROOT, "index.md")]
  while (queue.length) {
    const path = queue.shift()
    if (reachable.has(path) || !parsed.has(path)) continue
    reachable.add(path)
    for (const href of markdownLinks(parsed.get(path).body)) {
      const target = resolveInternalLink(path, href)
      if (target && parsed.has(target) && !reachable.has(target)) queue.push(target)
    }
  }
  for (const path of paths) {
    const name = path.split(/[\\/]/).at(-1)
    if (!["index.md", "log.md"].includes(name) && !reachable.has(path)) {
      violations.push(`${relative(ROOT, path)}: concept is not reachable from docs/index.md`)
    }
  }
}

function checkGenericText(violations) {
  const paths = [
    ...walk(
      join(ROOT, ".cursor"),
      (file) =>
        /\.(md|mdc|mjs|json|ya?ml)$/.test(file) &&
        !relative(ROOT, file).replaceAll("\\", "/").startsWith(".cursor/checks/"),
    ),
    ...walk(DOCS_ROOT, (file) => file.endsWith(".md")),
  ]
  for (const path of paths) {
    const rel = relative(ROOT, path)
    const text = readFileSync(path, "utf8")
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) violations.push(`${rel}: contains copied project identity`)
    }
  }
}

export function runHarnessLint() {
  const violations = []
  checkConfig(violations)
  checkDocs(violations)
  checkGenericText(violations)
  return violations
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const violations = runHarnessLint()
  if (violations.length) {
    process.stderr.write(`${violations.join("\n")}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write("Harness lint passed.\n")
  }
}
