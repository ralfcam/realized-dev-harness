#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { linearWriteVerdict } from "./lib/linear-mirror-policy.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const statePath = join(here, "state", "linear-resolver.json")

function setActive(active) {
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, `${JSON.stringify({ active })}\n`)
}

function active() {
  try {
    return Boolean(JSON.parse(readFileSync(statePath, "utf8")).active)
  } catch {
    return false
  }
}

function enabled() {
  try {
    return Boolean(
      JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf8"))
        .integrations.linear.enabled,
    )
  } catch {
    return false
  }
}

function input() {
  try {
    return JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, "") || "{}")
  } catch {
    return {}
  }
}

const mode = process.argv[2]
if (mode === "start") setActive(true)
else if (mode === "stop") setActive(false)
else {
  const payload = input()
  const verdict = linearWriteVerdict({
    server:
      payload.server_name ||
      payload.server ||
      payload.mcp_server_name ||
      payload.tool_input?.server,
    tool:
      payload.tool_name ||
      payload.mcp_tool_name ||
      payload.tool ||
      payload.tool_input?.tool,
    enabled: enabled(),
    resolverActive: active(),
  })
  if (verdict.allow) process.stdout.write("{}\n")
  else {
    process.stdout.write(
      `${JSON.stringify({
        permission: "deny",
        user_message:
          verdict.reason === "profile_disabled"
            ? "Linear writes are disabled for this project."
            : "Linear writes are restricted to the linear-resolver mirror agent.",
      })}\n`,
    )
  }
}
