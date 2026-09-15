/**
 * Shared MCP hook payload parsing. Cursor delivers beforeMCPExecution as
 * tool_name=<mcp tool>, tool_input as a JSON string, mcp_server_name/command
 * as the server key. Windows stdin is BOM-prefixed.
 */
import { readFileSync } from "node:fs"

export function readStdinJson() {
  try {
    const text = readFileSync(0, "utf8").replace(/^\uFEFF/, "")
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

export function writeStdoutJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

export function parseToolInput(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw
  if (typeof raw !== "string") return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

/** CallMcpTool, preToolUse MCP:<name>, and beforeMCPExecution payloads. */
export function extractMcpCall(input) {
  const rawName = typeof input.tool_name === "string" ? input.tool_name : ""
  const ti = parseToolInput(input.tool_input)
  if (rawName === "CallMcpTool") {
    return { server: ti.server, toolName: ti.toolName, args: ti.arguments }
  }
  const toolName = rawName.startsWith("MCP:") ? rawName.slice(4) : rawName
  if (!toolName) return null
  return {
    server: input.mcp_server_name ?? input.command ?? input.url ?? ti.server,
    toolName,
    args: ti.arguments ?? ti,
  }
}

export function isLinearServer(server) {
  return typeof server === "string" && /linear/i.test(server)
}
