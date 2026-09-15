/**
 * Detectors for two Task-delegation hazards observed in the RES-1386 Wave 3
 * incident: a nested `generalPurpose` subagent, invoked with an explicit
 * `model` override, uploaded a plan-body comment through raw Linear MCP
 * calls it was never scoped to make.
 *
 * Two independent, additive checks:
 *
 *   1. Model override on a pinned subagent type. Several `.cursor/agents/
 *      <type>.md` files pin a `model:` in frontmatter (e.g. linear-resolver,
 *      tdd-red/green/refactor). Passing `model` on a Task invocation of one
 *      of those types silently overrides a deliberate pin. Deterministic
 *      and cheap: read the frontmatter once, compare presence of `model` on
 *      the call.
 *
 *   2. A `generalPurpose` Task whose prompt instructs a Linear MCP write
 *      (save_comment, save_issue, save_document, or a direct
 *      plugin-linear-linear reference). generalPurpose has never read
 *      linear-resolver's size/spawn limits, so routing a Linear write
 *      through it bypasses every doctrine guard scoped to linear-resolver.
 *      This is a prompt-text heuristic — defense in depth, not a substitute
 *      for the beforeMCPExecution guards that check the actual MCP call.
 *
 * Neither check needs agent identity from the payload: pin lookup reads the
 * frontmatter file named by subagent_type, and the write-instruction check
 * scans the prompt text handed to this specific Task call.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const AGENTS_DIR = join(".cursor", "agents")

const LINEAR_WRITE_PATTERN =
  /\bsave_comment\b|\bsave_issue\b|\bsave_document\b|plugin-linear-linear/i

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

function agentFrontmatter(subagentType) {
  if (typeof subagentType !== "string" || !subagentType.trim()) return ""
  const path = join(AGENTS_DIR, `${subagentType}.md`)
  if (!existsSync(path)) return ""
  try {
    const text = readFileSync(path, "utf8")
    const match = text.match(/^---\n([\s\S]*?)\n---/)
    return match ? match[1] : ""
  } catch {
    return ""
  }
}

/** Returns the pinned model string from frontmatter, or null if unpinned/unknown type. */
export function getPinnedModel(subagentType) {
  const frontmatter = agentFrontmatter(subagentType)
  const match = frontmatter.match(/^model:\s*(.+)$/m)
  return match ? match[1].trim() : null
}

/** Returns { kind, pinned } when `model` overrides a pinned subagent type, else null. */
export function detectModelOverride(subagentType, model) {
  if (typeof model !== "string" || !model.trim()) return null
  const pinned = getPinnedModel(subagentType)
  if (!pinned) return null
  return { kind: "model-override", pinned }
}

/** Returns { kind } when a generalPurpose Task prompt instructs a Linear MCP write, else null. */
export function detectGeneralPurposeLinearWrite(subagentType, prompt) {
  if (subagentType !== "generalPurpose") return null
  if (typeof prompt !== "string" || !prompt.trim()) return null
  if (!LINEAR_WRITE_PATTERN.test(prompt)) return null
  return { kind: "generalPurpose-linear-write" }
}

/** Runs both detectors; returns the first hit or null. */
export function checkTaskDelegation({ subagentType, model, prompt }) {
  return (
    detectModelOverride(subagentType, model) ??
    detectGeneralPurposeLinearWrite(subagentType, prompt)
  )
}
