#!/usr/bin/env node
/**
 * postToolUse (Shell): after a successful git commit, nudge the parent agent
 * to delegate docs-updater via additional_context.
 */
import {
  readStdinJson,
  writeStdoutJson,
  isGitCommitCommand,
  shellSucceeded,
  headChangedFiles,
  needsDocsSync,
  DELEGATE_INSTRUCTION,
} from "./lib/docs-sync-policy.mjs"

function main() {
  try {
    const input = readStdinJson()
    const command =
      input.tool_input?.command ?? input.command ?? input.tool_input ?? ""

    if (input.tool_name !== "Shell" || !isGitCommitCommand(command)) {
      writeStdoutJson({})
      return
    }

    if (!shellSucceeded(input.tool_output)) {
      writeStdoutJson({})
      return
    }

    const files = headChangedFiles()
    if (!needsDocsSync(files)) {
      writeStdoutJson({})
      return
    }

    writeStdoutJson({
      additional_context: `[docs-sync hook: git commit] ${DELEGATE_INSTRUCTION}`,
    })
  } catch (err) {
    console.error("[after-git-commit hook]", err)
    writeStdoutJson({})
  }
}

main()
