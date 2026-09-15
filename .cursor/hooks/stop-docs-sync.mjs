#!/usr/bin/env node
/**
 * stop: when the agent completes after implementation work, auto-submit a
 * follow-up to run docs-updater (once per conversation).
 */
import {
  readStdinJson,
  writeStdoutJson,
  headChangedFiles,
  needsDocsSync,
  uncommittedImplPaths,
  wasSessionTriggered,
  markSessionTriggered,
  DELEGATE_INSTRUCTION,
} from "./lib/docs-sync-policy.mjs"

function main() {
  try {
    const input = readStdinJson()
    const status = input.status
    const conversationId =
      input.conversation_id ?? input.session_id ?? "unknown"

    if (status !== "completed") {
      writeStdoutJson({})
      return
    }

    if (wasSessionTriggered(conversationId)) {
      writeStdoutJson({})
      return
    }

    const committed = headChangedFiles()
    const uncommitted = uncommittedImplPaths()
    const shouldSync = needsDocsSync(committed) || uncommitted.length > 0

    if (!shouldSync) {
      writeStdoutJson({})
      return
    }

    markSessionTriggered(conversationId)

    const scope =
      uncommitted.length > 0 && !needsDocsSync(committed)
        ? "uncommitted implementation changes"
        : "HEAD"

    writeStdoutJson({
      followup_message: `${DELEGATE_INSTRUCTION} Scope: ${scope}.`,
    })
  } catch (err) {
    console.error("[stop-docs-sync hook]", err)
    writeStdoutJson({})
  }
}

main()
