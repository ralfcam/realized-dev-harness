import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = join(__dirname, "..", "state", "docs-sync-sessions.json")

/** Paths that imply user-facing or testable behavior changed. */
export const IMPL_PREFIXES = [
  "app/",
  "supabase/migrations/",
  "supabase/functions/",
  "supabase/seeds/",
  "tests/",
  "lib/",
  "src/",
  "components/",
  ".github/workflows/",
]

/** Commits touching only these do not need docs-updater. */
export const DOCS_ONLY_PREFIXES = [
  "docs/",
  ".cursor/plans/",
  ".cursor/agents/",
  ".cursor/rules/",
  ".cursor/hooks/",
]

export const DOCS_ONLY_FILES = new Set([
  "CONTRIBUTING.md",
  "README.md",
  "docs/README.md",
])

export const DELEGATE_INSTRUCTION =
  "Use the docs-updater subagent in the background to sync docs for HEAD. Skip if HEAD is docs-only (only docs/, CONTRIBUTING.md, README.md, or .cursor/plans/) or has no implementation impact."

export function readStdinJson() {
  const text = readFileSync(0, "utf8")
  return text ? JSON.parse(text) : {}
}

export function writeStdoutJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

export function git(args, cwd = process.cwd()) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  })
  if (r.status !== 0) return null
  return (r.stdout || "").trim()
}

export function isGitCommitCommand(command) {
  if (!command || typeof command !== "string") return false
  const normalized = command.replace(/\s+/g, " ").trim()
  return /\bgit\s+commit\b/.test(normalized)
}

export function shellSucceeded(toolOutput) {
  if (!toolOutput) return false
  try {
    const parsed = JSON.parse(toolOutput)
    if (typeof parsed.exitCode === "number") return parsed.exitCode === 0
    if (typeof parsed.exit_code === "number") return parsed.exit_code === 0
  } catch {
    // fall through
  }
  const lower = String(toolOutput).toLowerCase()
  if (/exit code[:\s]+0\b/.test(lower) || /exitcode["\s:]+0/.test(lower)) {
    return true
  }
  return !/\b(error|fatal|failed)\b/i.test(toolOutput)
}

export function headChangedFiles() {
  const out = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])
  if (!out) return []
  return out.split(/\r?\n/).filter(Boolean)
}

export function hasImplementationChanges(files) {
  return files.some((f) => IMPL_PREFIXES.some((p) => f.startsWith(p)))
}

export function isDocsOnlyChange(files) {
  if (files.length === 0) return true
  return files.every(
    (f) =>
      DOCS_ONLY_PREFIXES.some((p) => f.startsWith(p)) ||
      DOCS_ONLY_FILES.has(f) ||
      /\.(md|mdc)$/i.test(f),
  )
}

export function needsDocsSync(files) {
  if (files.length === 0) return false
  if (isDocsOnlyChange(files)) return false
  return hasImplementationChanges(files)
}

export function uncommittedImplPaths() {
  const out = git(["status", "--porcelain"])
  if (!out) return []
  const paths = []
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue
    const path = line
      .slice(3)
      .trim()
      .replace(/^"(.*)"$/, "$1")
    if (path.includes(" -> ")) {
      paths.push(path.split(" -> ").pop())
    } else {
      paths.push(path)
    }
  }
  return paths.filter((p) =>
    IMPL_PREFIXES.some((prefix) => p.startsWith(prefix)),
  )
}

export function loadSessionState() {
  try {
    if (!existsSync(STATE_PATH)) return {}
    return JSON.parse(readFileSync(STATE_PATH, "utf8"))
  } catch {
    return {}
  }
}

export function markSessionTriggered(conversationId) {
  const state = loadSessionState()
  state[conversationId] = { triggeredAt: new Date().toISOString() }
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8")
}

export function wasSessionTriggered(conversationId) {
  if (!conversationId) return false
  return Boolean(loadSessionState()[conversationId])
}
