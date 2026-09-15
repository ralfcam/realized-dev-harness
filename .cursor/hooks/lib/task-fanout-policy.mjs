/**
 * Shared in-flight cap for Task fan-out.
 *
 * Goal: stop orchestrators from dumping dozens of Task calls in one composer
 * message (bubble-creation timeouts). Prose in /capture and /audit waves at
 * this number; the preToolUse guard enforces it mechanically.
 *
 * Reservations: increment on an allowed Task preToolUse (pending); convert
 * pending → running on subagentStart (total in-flight unchanged); release on
 * subagentStop or Task postToolUseFailure. TTL prune so a crashed composer
 * cannot stick the cap.
 *
 * Fails OPEN at the hook: any error returns no opinion so TDD Task calls are
 * never bricked. Raise the cap only in TASK_FANOUT_INFLIGHT_CAP (harness-lint
 * pins the same number in .cursor/rules/task-fanout.mdc).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = join(__dirname, "..", "state", "task-fanout.json")

export const TASK_FANOUT_INFLIGHT_CAP = 8
export const RESERVATION_TTL_MS = 120_000

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

export function isTaskTool(toolName) {
  return toolName === "Task"
}

function asReservation(x) {
  if (!x || typeof x !== "object") return null
  if (x.status !== "pending" && x.status !== "running") return null
  const ts = Number(x.ts)
  if (!Number.isFinite(ts)) return null
  return { status: x.status, ts }
}

export function pruneExpired(reservations, now = Date.now()) {
  if (!Array.isArray(reservations)) return []
  return reservations
    .map(asReservation)
    .filter((r) => r && now - r.ts < RESERVATION_TTL_MS)
}

export function inflightCount(reservations, now = Date.now()) {
  return pruneExpired(reservations, now).length
}

/** Add a pending reservation, or deny when in-flight is already at the cap. */
export function tryReserve(reservations, now = Date.now()) {
  const live = pruneExpired(reservations, now)
  if (live.length >= TASK_FANOUT_INFLIGHT_CAP) {
    return { deny: true, reservations: live }
  }
  return {
    deny: false,
    reservations: [...live, { status: "pending", ts: now }],
  }
}

/** Convert the oldest pending slot to running. Total in-flight is unchanged. */
export function onSubagentStart(reservations, now = Date.now()) {
  const live = pruneExpired(reservations, now)
  const idx = live.findIndex((r) => r.status === "pending")
  if (idx === -1) return live
  const next = live.slice()
  next[idx] = { status: "running", ts: live[idx].ts }
  return next
}

/** Release one running slot (fallback: a pending slot). */
export function onSubagentStop(reservations, now = Date.now()) {
  const live = pruneExpired(reservations, now)
  const runIdx = live.findIndex((r) => r.status === "running")
  if (runIdx !== -1) return live.filter((_, i) => i !== runIdx)
  const pendIdx = live.findIndex((r) => r.status === "pending")
  if (pendIdx !== -1) return live.filter((_, i) => i !== pendIdx)
  return live
}

/** Release one pending slot after Task failed to spawn. */
export function onTaskFailure(reservations, now = Date.now()) {
  const live = pruneExpired(reservations, now)
  const pendIdx = live.findIndex((r) => r.status === "pending")
  if (pendIdx !== -1) return live.filter((_, i) => i !== pendIdx)
  return live
}

export function loadReservations() {
  try {
    if (!existsSync(STATE_PATH)) return []
    const s = JSON.parse(readFileSync(STATE_PATH, "utf8"))
    return Array.isArray(s.reservations) ? s.reservations : []
  } catch {
    return []
  }
}

export function saveReservations(reservations) {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify({ reservations }, null, 2), "utf8")
}
