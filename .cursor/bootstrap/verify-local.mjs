#!/usr/bin/env node
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyInitializedProject } from "./verification.mjs"

async function main() {
  try {
    const config = await verifyInitializedProject()
    process.stdout.write(
      `Local Supabase and all configured checks verified at ${config.project.localSupabaseVerifiedAt}.\n`,
    )
  } catch (error) {
    process.stderr.write(`verify-local: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  await main()
}

