import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("bootstrap-smoke uses Docker-capable full initialization without bypasses", () => {
  const workflow = readFileSync(
    ".github/workflows/bootstrap-smoke.yml",
    "utf8",
  )
  assert.match(workflow, /runs-on: ubuntu-latest/)
  assert.match(workflow, /os: \[ubuntu-latest, macos-latest, windows-latest\]/)
  assert.match(workflow, /runs-on: \$\{\{ matrix\.os \}\}/)
  assert.match(workflow, /node-version: 24/)
  assert.match(workflow, /version: 10\.34\.5/)
  assert.match(
    workflow,
    /node \.cursor\/bootstrap\/init\.mjs --project-name ci-bootstrap-smoke/,
  )
  assert.match(workflow, /--project-name matrix-bootstrap --skip-supabase-start/)
  const fullBootstrap = workflow.split("  full-bootstrap:")[1]
  assert.doesNotMatch(fullBootstrap, /--skip-supabase-start|--skip-install/)
  assert.match(fullBootstrap, /pnpm harness:doctor/)
})

test("CodeRabbit profile gates only the configured accumulator latest head", () => {
  const workflow = readFileSync(
    ".cursor/profiles/coderabbit/coderabbit-main-gate.yml",
    "utf8",
  )
  assert.match(workflow, /branches: \["\{\{DEFAULT_BRANCH\}\}"\]/)
  assert.match(workflow, /head\.ref == '\{\{ACCUMULATOR_BRANCH\}\}'/)
  assert.match(workflow, /review\.commit_id === head/)
  assert.match(workflow, /coderabbitai\[bot\]/)
  assert.doesNotMatch(workflow, /auth login|api[_-]?key/i)
})
