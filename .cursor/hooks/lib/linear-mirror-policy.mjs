export const LINEAR_WRITE_TOOLS = new Set([
  "save_issue",
  "save_comment",
  "save_project",
  "save_status_update",
  "save_document",
])

export function isLinearWrite(server, tool) {
  return (
    typeof server === "string" &&
    server.toLowerCase().includes("linear") &&
    LINEAR_WRITE_TOOLS.has(tool)
  )
}

export function linearWriteVerdict({ server, tool, enabled, resolverActive }) {
  if (!isLinearWrite(server, tool)) return { allow: true, reason: "out_of_scope" }
  if (!enabled) return { allow: false, reason: "profile_disabled" }
  if (!resolverActive) return { allow: false, reason: "resolver_only" }
  return { allow: true, reason: "mirror" }
}
