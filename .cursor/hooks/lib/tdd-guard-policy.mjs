/**
 * Shared state + path policy for the /sdd-to-tdd delegation guard.
 *
 * Goal: while an sdd-to-tdd execution is ARMED, the top-level orchestrator must
 * not edit implementation/test files directly — those edits must come from the
 * tdd-red / tdd-green / tdd-refactor subagents. We allow the write when a
 * subagent is currently running (depth > 0) and block it when the parent is the
 * one editing (depth === 0).
 *
 * State is a single JSON file so the CLI control (`tdd-guard.mjs on/off`), the
 * subagent depth tracker, and the preToolUse guard all share it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = join(__dirname, "..", "state", "tdd-guard.json")

/** Paths the orchestrator may NOT edit directly while armed (delegate instead). */
export const PROTECTED_PREFIXES = [
  "tests/",
  "lib/",
  "app/",
  "components/",
  "hooks/",
  "src/",
  "supabase/",
]

/**
 * The one direct write the orchestrator is allowed to make while armed: the
 * approved spec edit. Everything outside PROTECTED_PREFIXES is allowed anyway;
 * this list documents the intended carve-out.
 */
export const ALLOWED_FOR_PARENT = ["docs/"]

/** Specs are read-only while a TDD phase is set. Parent spec edits run with phase null (including during background START). */
export const SPEC_PREFIX = "docs/specs/"

/** ADRs are likewise read-only for subagents (normative decision records). */
export const ADR_PREFIX = "docs/ADR/"

/** The Red phase's exclusive write scope. */
export const TESTS_PREFIX = "tests/"
export const DOCS_ARTIFACT_PREFIXES = [
  "docs/findings/",
  "docs/verifier-reports/",
]
export const TDD_VERIFIER_PREFIX = "docs/verifier-reports/tdd/"

/** Tools that write to disk (best-effort; tighten once real names are confirmed). */
const WRITE_TOOL_RE = /(write|edit|replace|patch|create|apply)/i

export function readStdinJson() {
  try {
    // Cursor prefixes hook stdin with a UTF-8 BOM on Windows; JSON.parse rejects it.
    const text = readFileSync(0, "utf8").replace(/^\uFEFF/, "")
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

export function writeStdoutJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

const VALID_PHASES = ["red", "green", "refactor"]

const VALID_EXEMPTIONS = ["docs-artifact", "gate-remediation"]

function defaultState() {
  return {
    armed: false,
    depth: 0,
    phase: null,
    loopRan: false,
    commitExempt: null,
  }
}

function loadState() {
  try {
    if (!existsSync(STATE_PATH)) return defaultState()
    const s = JSON.parse(readFileSync(STATE_PATH, "utf8"))
    return {
      armed: Boolean(s.armed),
      depth: Number(s.depth) || 0,
      phase: VALID_PHASES.includes(s.phase) ? s.phase : null,
      loopRan: Boolean(s.loopRan),
      commitExempt: VALID_EXEMPTIONS.includes(s.commitExempt)
        ? s.commitExempt
        : null,
    }
  } catch {
    return defaultState()
  }
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8")
}

export function arm() {
  saveState({
    armed: true,
    depth: 0,
    phase: null,
    loopRan: false,
    commitExempt: null,
  })
}

export function disarm() {
  const s = loadState()
  saveState({
    armed: false,
    depth: 0,
    phase: null,
    loopRan: s.loopRan,
    commitExempt: s.commitExempt,
  })
}

export function isArmed() {
  return loadState().armed
}

export function getDepth() {
  return loadState().depth
}

export function incDepth() {
  const s = loadState()
  if (!s.armed) return
  saveState({ ...s, depth: s.depth + 1 })
}

export function decDepth() {
  const s = loadState()
  if (!s.armed) return
  saveState({ ...s, depth: Math.max(0, s.depth - 1) })
}

/** Set the active TDD phase (red/green/refactor) so the delegation guard can
 * enforce phase-scoped write boundaries on the subagent currently running. */
export function setPhase(phase) {
  const s = loadState()
  if (!s.armed) return
  if (!VALID_PHASES.includes(phase)) return
  saveState({ ...s, phase, loopRan: true })
}

export function clearPhase() {
  const s = loadState()
  if (!s.armed) return
  saveState({ ...s, phase: null })
}

export function getPhase() {
  return loadState().phase
}

export function status() {
  return loadState()
}

/** Clear loopRan so /commit can proceed after the TDD loop. */
export function openCommitGate(exempt = null) {
  const s = loadState()
  saveState({
    ...s,
    loopRan: false,
    commitExempt: VALID_EXEMPTIONS.includes(exempt) ? exempt : null,
  })
}

export function getCommitExempt() {
  return loadState().commitExempt
}

export function isLoopRan() {
  return loadState().loopRan
}

export function isDocsArtifactPath(relPath) {
  const path = normalize(relPath)
  if (path.startsWith(TDD_VERIFIER_PREFIX)) return false
  return DOCS_ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export function stagedPathsFromGit(cwd = process.cwd()) {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "-z"], {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout.split("\0").map(normalize).filter(Boolean)
}

export function evaluateGateOpen({ exemption, dirtyPaths }) {
  if (exemption === "docs-artifact") {
    if (dirtyPaths?.length && dirtyPaths.every(isDocsArtifactPath)) {
      return { ok: true, exempt: "docs-artifact" }
    }
    return { ok: false, reason: "exempt_path_mismatch" }
  }
  if (exemption === "gate-remediation") {
    return { ok: true, exempt: "gate-remediation" }
  }
  return { ok: true, exempt: null, receiptIndependent: true }
}

export function evaluateGitCommitPermission({
  loopRan,
  exemption,
  stagedPaths,
}) {
  if (loopRan) return { ok: false, reason: "loopRan", deny: "tdd" }
  if (exemption === "docs-artifact") {
    if (!stagedPaths?.length || !stagedPaths.every(isDocsArtifactPath)) {
      return { ok: false, reason: "exempt_path_mismatch", deny: "tdd" }
    }
    return { ok: true, exempt: "docs-artifact" }
  }
  if (exemption === "gate-remediation") {
    return { ok: true, exempt: "gate-remediation" }
  }
  return { ok: true, exempt: null }
}

export function isWriteTool(toolName) {
  return typeof toolName === "string" && WRITE_TOOL_RE.test(toolName)
}

/** Pull the target file path from common tool-input shapes. */
export function extractPath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return null
  const direct =
    toolInput.path ||
    toolInput.file_path ||
    toolInput.target_file ||
    toolInput.filePath
  if (typeof direct === "string") return normalize(direct)
  // MultiEdit-style: edits[].file_path
  if (Array.isArray(toolInput.edits) && toolInput.edits[0]) {
    const p = toolInput.edits[0].file_path || toolInput.edits[0].path
    if (typeof p === "string") return normalize(p)
  }
  return null
}

function normalize(p) {
  // Strip a leading absolute repo path and normalize slashes to forward slashes.
  let s = String(p).replace(/\\/g, "/")
  const marker = "/restaurant-system/"
  const idx = s.indexOf(marker)
  if (idx !== -1) s = s.slice(idx + marker.length)
  return s.replace(/^\.?\//, "")
}

export function isProtected(relPath) {
  if (!relPath) return false
  return PROTECTED_PREFIXES.some((p) => relPath.startsWith(p))
}

export function isSpecPath(relPath) {
  if (!relPath) return false
  return relPath.startsWith(SPEC_PREFIX) || relPath.startsWith(ADR_PREFIX)
}

export function isTestsPath(relPath) {
  if (!relPath) return false
  return relPath.startsWith(TESTS_PREFIX)
}

/**
 * Pure write-scope policy used by the delegation hook. Returns
 * `{ deny: true, kind }` or `null` (allowed / not in scope).
 *
 * `kind`:
 *   spec        — docs/specs/** or docs/ADR/** while a TDD phase is set
 *   phase-red   — red phase writing outside tests/
 *   phase-tests — green/refactor writing under tests/
 *   delegation  — parent orchestrator (depth 0) writing a protected path
 *
 * Spec deny keys off `phase`, not `depth`. Background START increments depth
 * while phase is still null; the parent must still apply the approved spec
 * edit. Depth-only deny treated that parent write as a subagent edit.
 */
export function checkTddWrite(relPath, { depth, phase }) {
  if (isSpecPath(relPath) && VALID_PHASES.includes(phase)) {
    return { deny: true, kind: "spec" }
  }
  if (!isProtected(relPath)) return null
  if (depth > 0) {
    if (phase === "red" && !isTestsPath(relPath))
      return { deny: true, kind: "phase-red" }
    if ((phase === "green" || phase === "refactor") && isTestsPath(relPath)) {
      return { deny: true, kind: "phase-tests" }
    }
    return null
  }
  return { deny: true, kind: "delegation" }
}

/** Detect a blanket `git add -A|--all|.` or `git commit -a|--all` in a shell
 * command string. Segments the command on &&/;/|/|| so it also catches
 * chained invocations. Returns null when nothing matches. */
export function detectBlanketGitStage(command) {
  if (typeof command !== "string" || !command.trim()) return null
  const segments = command.split(/&&|\|\||;|\|/)
  for (const rawSeg of segments) {
    const tokens = rawSeg.trim().split(/\s+/).filter(Boolean)
    const gitIdx = tokens.indexOf("git")
    if (gitIdx === -1) continue
    const sub = tokens[gitIdx + 1]
    const rest = tokens.slice(gitIdx + 2)
    if (sub === "add") {
      if (rest.some((t) => t === "-A" || t === "--all" || t === ".")) {
        return { kind: "add", segment: rawSeg.trim() }
      }
    }
    if (sub === "commit") {
      const hasBlanketFlag = rest.some(
        (t) =>
          t === "--all" ||
          (/^-[a-zA-Z]+$/.test(t) && !t.startsWith("--") && t.includes("a")),
      )
      if (hasBlanketFlag) {
        return { kind: "commit", segment: rawSeg.trim() }
      }
    }
  }
  return null
}

/** Detect `gh pr merge` in a shell command string. Segments on &&/;/|/||
 * so it also catches chained invocations. Returns null when nothing matches. */
export function detectGhPrMerge(command) {
  if (typeof command !== "string" || !command.trim()) return null
  const segments = command.split(/&&|\|\||;|\|/)
  for (const rawSeg of segments) {
    const tokens = rawSeg.trim().split(/\s+/).filter(Boolean)
    const ghIdx = tokens.indexOf("gh")
    if (ghIdx === -1) continue
    if (tokens[ghIdx + 1] === "pr" && tokens[ghIdx + 2] === "merge") {
      return { kind: "pr-merge", segment: rawSeg.trim() }
    }
  }
  return null
}

/** Detect any `git commit` in a shell command string. Segments on &&/;/|/||
 * so it also catches chained invocations. Returns null when nothing matches. */
export function detectGitCommit(command) {
  if (typeof command !== "string" || !command.trim()) return null
  const segments = command.split(/&&|\|\||;|\|/)
  for (const rawSeg of segments) {
    const tokens = rawSeg.trim().split(/\s+/).filter(Boolean)
    const gitIdx = tokens.indexOf("git")
    if (gitIdx === -1) continue
    if (tokens[gitIdx + 1] === "commit") {
      return { kind: "commit", segment: rawSeg.trim() }
    }
  }
  return null
}
