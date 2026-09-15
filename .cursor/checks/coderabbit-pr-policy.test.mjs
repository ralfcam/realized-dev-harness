import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  US_APP_ID,
  US_LATEST_HEAD_CHECK_NAME,
  classifyFindingRouting,
  evaluateReadyPr,
} from "../hooks/lib/coderabbit-pr-policy.mjs"

const FIX = join(process.cwd(), ".cursor", "checks", "fixtures", "coderabbit")
const WORKFLOW = join(
  process.cwd(),
  ".github",
  "workflows",
  "coderabbit-main-gate.yml",
)

function load(name) {
  return JSON.parse(readFileSync(join(FIX, name), "utf8"))
}

const CASES = [
  ["remote-clean.json", true, "clean"],
  ["remote-stale-approval.json", false, "stale_approval"],
  ["remote-coderabbit-other.json", false, "wrong_bot"],
  ["remote-unresolved-threads.json", false, "unresolved_threads"],
  ["remote-rate-limit.json", false, "rate_limited"],
  ["remote-billing.json", false, "billing"],
  ["remote-override.json", false, "explicit_override"],
  ["remote-pending.json", false, "pending"],
  ["remote-draft.json", false, "draft"],
  ["remote-wrong-bot.json", false, "wrong_bot"],
]

for (const [file, ok, reason] of CASES) {
  test(`ready-PR snapshot ${file} → ${reason}`, () => {
    const result = evaluateReadyPr(load(file))
    assert.equal(result.ok, ok, file)
    assert.equal(result.reason, reason, file)
  })
}

test("clean snapshot pins US app id and check name", () => {
  const result = evaluateReadyPr(load("remote-clean.json"))
  assert.equal(result.usAppId, US_APP_ID)
  assert.equal(result.checkName, US_LATEST_HEAD_CHECK_NAME)
})

test("in-scope findings route to /sdd-to-tdd; residuals to /capture", () => {
  assert.equal(
    classifyFindingRouting(
      { fileName: "lib/example.ts" },
      { inScopePaths: ["lib/example.ts"] },
    ).command,
    "/sdd-to-tdd",
  )
  assert.equal(
    classifyFindingRouting(
      { fileName: "docs/findings/tech-debt.md" },
      {
        inScopePaths: ["lib/example.ts"],
      },
    ).command,
    "/capture",
  )
})

test("main-gate workflow is read-only, staging→main, and named US latest-head", () => {
  const yml = readFileSync(WORKFLOW, "utf8")
  assert.match(yml, /name: CodeRabbit US latest-head gate/)
  assert.match(yml, /pull_request:/)
  assert.match(yml, /ready_for_review/)
  assert.match(yml, /pull_request_review:/)
  assert.match(yml, /pull_request_review_comment:/)
  assert.doesNotMatch(yml, /^  pull_request_review_thread:/m)
  const pullRequestStart = yml.indexOf("\n  pull_request:")
  const pullRequestReviewStart = yml.indexOf("\n  pull_request_review:")
  assert.ok(pullRequestStart >= 0, "pull_request mapping")
  assert.ok(
    pullRequestReviewStart > pullRequestStart,
    "pull_request mapping precedes pull_request_review",
  )
  const pullRequestBlock = yml.slice(pullRequestStart, pullRequestReviewStart)
  const typesMatch = pullRequestBlock.match(/^\s+types:\s*\[([^\]]*)\]/m)
  assert.ok(typesMatch, "pull_request types list")
  const pullRequestTypes = typesMatch[1]
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean)
  assert.ok(
    pullRequestTypes.includes("edited"),
    "on.pull_request.types includes edited",
  )
  assert.match(
    yml,
    /github\.event\.pull_request\.base\.ref == 'main' && github\.event\.pull_request\.head\.ref == 'staging'/,
  )
  assert.match(yml, /contents: read/)
  assert.match(yml, /pull-requests: read/)
  assert.doesNotMatch(yml, /contents:\s*write/)
  assert.doesNotMatch(yml, /pull-requests:\s*write/)
  assert.match(yml, /coderabbit-pr-gate\.mjs --promotion-only/)
  assert.doesNotMatch(yml, /--use-credits/)
  assert.doesNotMatch(yml, /gh pr merge/)
})
