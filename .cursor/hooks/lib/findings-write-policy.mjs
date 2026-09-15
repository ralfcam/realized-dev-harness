/**
 * Allow-flag for docs/findings/** Writes. Parent orchestrator Writes are
 * denied unless a docs-updater subagent is in flight.
 *
 * Residual: a parent Shell redirect into docs/findings/ still bypasses,
 * same class as other Write-only guards. A concurrent parent Write while
 * docs-updater is in flight also passes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = join(__dirname, "..", "state", "findings-writer.json")

export const FINDINGS_PREFIX = "docs/findings/"

export function isFindingsPath(relPath) {
  if (!relPath) return false
  return relPath === "docs/findings" || relPath.startsWith(FINDINGS_PREFIX)
}

function loadState() {
  try {
    if (!existsSync(STATE_PATH)) return { allowed: false }
    const s = JSON.parse(readFileSync(STATE_PATH, "utf8"))
    return { allowed: s.allowed === true }
  } catch {
    return { allowed: false }
  }
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8")
}

export function isAllowed() {
  return loadState().allowed
}

export function setAllowed(allowed) {
  saveState({ allowed: Boolean(allowed) })
}

/** `{ deny: true }` when the path is under docs/findings/ and the flag is off. */
export function checkFindingsWrite(relPath, allowed = isAllowed()) {
  if (!isFindingsPath(relPath)) return null
  if (allowed) return null
  return { deny: true }
}
