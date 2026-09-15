#!/usr/bin/env node
/**
 * postToolUse / postToolUseFailure: advisory repeat-tool reminder.
 *
 * Counts consecutive calls with identical (tool, canonicalized-arguments)
 * and injects an escalating advisory at thresholds 3 / 5 / 8. Never vetoes.
 *
 * postToolUse — may return `additional_context` (the only non-blocking
 * model-visible channel). Denied calls route here only as postToolUseFailure,
 * which has no output fields: increment there and deliver the advisory on
 * the next postToolUse. Register with `--failure` on postToolUseFailure.
 *
 * Untracked bookkeeping tools (TodoWrite) are transparent to the chain, so
 * `Grep X → TodoWrite → Grep X` still counts as two consecutive Greps.
 * The advisory never replaces a tool result.
 *
 * failClosed: false — an advisory must not brick tool use.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readStdinJson, writeStdoutJson } from "./lib/tdd-guard-policy.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = join(__dirname, "state", "repeat-tool.json")

export const THRESHOLDS = [3, 5, 8]
export const ARGUMENTS_PREVIEW_CHARS = 500
const UNTRACKED = [/^todo_write$/i]

const FIRST_REMINDER =
  "You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call."

function detailedReminder(toolName, count, canonicalArgs) {
  const preview =
    canonicalArgs.length <= ARGUMENTS_PREVIEW_CHARS
      ? canonicalArgs
      : `${canonicalArgs.slice(0, ARGUMENTS_PREVIEW_CHARS)}… (+${canonicalArgs.length - ARGUMENTS_PREVIEW_CHARS} more chars)`
  return [
    "Repeated tool call detected:",
    `- tool: ${toolName}`,
    `- consecutive_calls: ${count}`,
    `- arguments: ${preview}`,
    "The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.",
  ].join("\n")
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    const out = {}
    for (const key of Object.keys(value).sort())
      out[key] = canonicalize(value[key])
    return out
  }
  return value
}

function isUntracked(toolName) {
  if (typeof toolName !== "string") return true
  return UNTRACKED.some((re) => re.test(toolName))
}

function chainKey(toolName, toolInput) {
  return `${toolName}\0${JSON.stringify(canonicalize(toolInput ?? {}))}`
}

function agentId(input) {
  return (
    input.conversation_id ||
    input.generation_id ||
    input.session_id ||
    "default"
  )
}

function loadState() {
  try {
    if (!existsSync(STATE_PATH)) return { chains: {} }
    const s = JSON.parse(readFileSync(STATE_PATH, "utf8"))
    return { chains: s.chains && typeof s.chains === "object" ? s.chains : {} }
  } catch {
    return { chains: {} }
  }
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8")
}

/** Advance the chain; return the advisory to deliver (if any) plus pending. */
export function recordCall(chain, toolName, toolInput) {
  const next = {
    lastKey: chain.lastKey ?? null,
    count: Number(chain.count) || 0,
    pending: chain.pending ?? null,
  }
  if (isUntracked(toolName)) return next
  const key = chainKey(toolName, toolInput)
  if (key === next.lastKey) next.count += 1
  else {
    next.lastKey = key
    next.count = 1
  }
  const idx = THRESHOLDS.indexOf(next.count)
  if (idx === 0) next.pending = FIRST_REMINDER
  else if (idx > 0)
    next.pending = detailedReminder(
      toolName,
      next.count,
      JSON.stringify(canonicalize(toolInput ?? {})),
    )
  return next
}

function main() {
  try {
    const input = readStdinJson()
    const failure = process.argv.includes("--failure")
    const toolName = input.tool_name
    const toolInput = input.tool_input
    const id = agentId(input)

    const state = loadState()
    const updated = recordCall(state.chains[id] || {}, toolName, toolInput)
    let pending = updated.pending
    if (!failure && pending) {
      updated.pending = null
    }
    state.chains[id] = updated
    saveState(state)

    if (failure) {
      writeStdoutJson({})
      return
    }
    if (pending) {
      writeStdoutJson({ additional_context: pending })
      return
    }
    writeStdoutJson({})
  } catch (err) {
    console.error("[repeat-tool-reminder]", err)
    writeStdoutJson({})
  }
}

main()
