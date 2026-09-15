/**
 * Detector for oversized Linear `save_comment` bodies.
 *
 * Mechanizes the START digest budget: doctrine (linear-resolver.md,
 * sdd-to-tdd.md, linear-automation.mdc) all point here for
 * START_SUMMARY_MAX_CHARS rather than restating the number, so the value
 * moves in one place if the measured ceiling changes.
 *
 * The number comes from a live measurement, not inference: probing a
 * scratch Linear issue (RES-1386) with save_comment at 8,000 / 12,000 /
 * 16,000 characters and reading each back with list_comments showed no
 * truncation at any of those sizes — existing comments on that issue run
 * to 54,226 characters intact. There is no observed single-call ceiling
 * near 12k; the ~12k figure in the incident history came from ad-hoc
 * chunker step sizes, not a Linear limit. START_SUMMARY_MAX_CHARS is
 * therefore a deliberate editorial budget (a human-readable digest, not
 * the technical maximum) rather than two-thirds of a measured wall.
 *
 * Scope is deliberately narrow: only save_comment.body. This is the
 * artifact the five incidents actually oversized (the plan-body upload).
 * save_issue.description and save_document.content are not budgeted here.
 *
 * Server identification reuses isLinearServer from runtime-guard-policy —
 * do not invent a second matcher.
 *
 * Returns null (within budget / not a scoped call) or
 * { length, max } (over budget).
 */
import { isLinearServer } from "./mcp-payload.mjs"

export const START_SUMMARY_MAX_CHARS = 8000

function asArgs(args) {
  return args !== null && typeof args === "object" && !Array.isArray(args)
    ? args
    : {}
}

export function detectOversizedComment(server, toolName, args) {
  if (!isLinearServer(server)) return null
  if (toolName !== "save_comment") return null
  const a = asArgs(args)
  if (typeof a.body !== "string") return null
  const length = a.body.length
  if (length <= START_SUMMARY_MAX_CHARS) return null
  return { length, max: START_SUMMARY_MAX_CHARS }
}
