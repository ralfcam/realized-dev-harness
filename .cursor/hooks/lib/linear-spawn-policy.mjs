/**
 * Detector for Linear MCP calls that spawn a Cursor Cloud Agent.
 *
 * Three doors, all reachable by tools agents already use:
 *   - save_issue.assignee — any value including null
 *   - save_issue.delegate — "Agent name or ID" in the Linear MCP schema
 *   - @Cursor in save_comment.body, save_issue.title / description,
 *     save_document.title / content, save_status_update.body, or a patch[]
 *     op's new_string / text
 *
 * Two deliberate choices:
 *   1. Scan patch ops. They inject text into a description without the
 *      description field ever appearing — a description-only scan is
 *      bypassable.
 *   2. The mention check is not negation-aware. Linear parses @Cursor as a
 *      mention regardless of surrounding prose, so "do not assign to @Cursor"
 *      still spawns an agent. Denying every occurrence is correct; the agent
 *      rephrases to "the Cursor integration".
 *
 * Server identification is the same Linear matcher as runtime-guard-policy
 * (isLinearServer) — do not invent a second one.
 *
 * Tool scope is deliberate: save_issue, save_comment, save_document, and
 * save_status_update. Mentions in those text bodies spawn the same way as
 * comments. save_project is knowingly out of scope.
 *
 * Returns null (no spawn) or { kind, field }.
 */
import { isLinearServer } from "./mcp-payload.mjs"

const CURSOR_MENTION = /@Cursor\b/i

function asArgs(args) {
  return args !== null && typeof args === "object" && !Array.isArray(args)
    ? args
    : {}
}

function mentionHit(value, field) {
  return typeof value === "string" && CURSOR_MENTION.test(value)
    ? { kind: "mention", field }
    : null
}

function scanPatch(patch) {
  if (!Array.isArray(patch)) return null
  for (const op of patch) {
    if (!op || typeof op !== "object") continue
    const viaNew = mentionHit(op.new_string, "new_string")
    if (viaNew) return viaNew
    const viaText = mentionHit(op.text, "text")
    if (viaText) return viaText
  }
  return null
}

export function detectLinearSpawn(server, toolName, args) {
  if (!isLinearServer(server)) return null
  if (typeof toolName !== "string") return null
  const a = asArgs(args)

  if (toolName === "save_issue") {
    if (Object.hasOwn(a, "assignee"))
      return { kind: "assignee", field: "assignee" }
    if (Object.hasOwn(a, "delegate"))
      return { kind: "delegate", field: "delegate" }
    const titleHit = mentionHit(a.title, "title")
    if (titleHit) return titleHit
    const descriptionHit = mentionHit(a.description, "description")
    if (descriptionHit) return descriptionHit
    return scanPatch(a.patch)
  }

  if (toolName === "save_comment") {
    return mentionHit(a.body, "body")
  }

  if (toolName === "save_status_update") {
    return mentionHit(a.body, "body")
  }

  if (toolName === "save_document") {
    const titleHit = mentionHit(a.title, "title")
    if (titleHit) return titleHit
    const contentHit = mentionHit(a.content, "content")
    if (contentHit) return contentHit
    return scanPatch(a.patch)
  }

  return null
}
