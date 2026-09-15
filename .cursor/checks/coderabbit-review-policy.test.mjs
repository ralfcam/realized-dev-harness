import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  PINNED_CLI_VERSION,
  assertPinnedUsAuth,
  applyWaivers,
  buildReceipt,
  evaluateAgentStream,
  evaluateWorkOrder,
  findingFingerprint,
  isSecretPath,
  parseGitPorcelain,
  parseJsonl,
  resolveCrBinary,
  reviewCommandArgs,
  unrelatedDirtyPaths,
} from "../hooks/lib/coderabbit-review-policy.mjs"
import {
  evaluateGateOpen,
  evaluateGitCommitPermission,
  isDocsArtifactPath,
} from "../hooks/lib/tdd-guard-policy.mjs"

const FIX = join(process.cwd(), ".cursor", "checks", "fixtures", "coderabbit")

function loadEvents(name) {
  const parsed = parseJsonl(readFileSync(join(FIX, name), "utf8"))
  return parsed
}

const EXPECTED = { reviewablePaths: ["lib/example.ts"], base: "staging" }

test("parseGitPorcelain reads modified, untracked, and renamed paths", () => {
  const text = [" M lib/a.ts", "?? lib/b.ts", "R  old.ts -> lib/c.ts"].join(
    "\n",
  )
  assert.deepEqual(parseGitPorcelain(text), [
    "lib/a.ts",
    "lib/b.ts",
    "lib/c.ts",
  ])
})

test("unrelatedDirtyPaths and secret paths fail the work-order", () => {
  assert.deepEqual(
    unrelatedDirtyPaths(["lib/a.ts", "app/x.ts"], ["lib/a.ts"]),
    ["app/x.ts"],
  )
  assert.equal(isSecretPath(".env"), true)
  assert.equal(isSecretPath(".env.local"), true)
  assert.equal(isSecretPath("id_rsa"), true)
  assert.equal(isSecretPath("tls.pem"), true)
  assert.equal(isSecretPath("lib/example.ts"), false)
  assert.equal(
    evaluateWorkOrder({
      dirtyPaths: [".env"],
      expectedPaths: [".env"],
    }).reason,
    "secret_path",
  )
  assert.equal(
    evaluateWorkOrder({
      dirtyPaths: ["lib/a.ts", "notes.md"],
      expectedPaths: ["lib/a.ts"],
    }).reason,
    "unrelated_dirt",
  )
  assert.equal(
    evaluateWorkOrder({
      dirtyPaths: ["lib/example.ts"],
      expectedPaths: ["lib/example.ts", "docs/specs/foo.md"],
    }).ok,
    true,
  )
  assert.equal(
    evaluateWorkOrder({ dirtyPaths: [], expectedPaths: ["lib/example.ts"] })
      .reason,
    "no_reviewable_paths",
  )
})

test("clean JSONL completes with exact reviewedFiles", () => {
  const parsed = loadEvents("local-clean.jsonl")
  assert.equal(parsed.ok, true)
  const result = evaluateAgentStream(parsed.events, EXPECTED)
  assert.equal(result.ok, true)
  assert.deepEqual(result.reviewedFiles, ["lib/example.ts"])
})

test("blocking severities fail without a fingerprint waiver", () => {
  for (const [file, reason] of [
    ["local-critical.jsonl", "unresolved_findings"],
    ["local-major.jsonl", "unresolved_findings"],
    ["local-minor.jsonl", "unresolved_findings"],
  ]) {
    const parsed = loadEvents(file)
    const result = evaluateAgentStream(parsed.events, EXPECTED)
    assert.equal(result.ok, false, file)
    assert.equal(result.reason, reason, file)
    assert.equal(result.blocking.length, 1, file)
  }
})

test("trivial findings are non-blocking; codegenInstructions are recorded not executed", () => {
  const parsed = loadEvents("local-trivial.jsonl")
  const result = evaluateAgentStream(parsed.events, EXPECTED)
  assert.equal(result.ok, true)
  assert.equal(result.nonBlocking.length, 1)
  assert.equal(result.findings[0].codegenInstructions, "echo pwned")
})

test("major finding is waived only when the fingerprint matches", () => {
  const parsed = loadEvents("local-major.jsonl")
  const finding = parsed.events.find((e) => e.type === "finding")
  const fp = findingFingerprint(finding)
  const waived = applyWaivers([finding], [{ findingFingerprint: fp }])
  assert.equal(waived.blocking.length, 0)
  assert.equal(waived.waived.length, 1)
  const result = evaluateAgentStream(parsed.events, {
    ...EXPECTED,
    waivers: [{ findingFingerprint: fp }],
  })
  assert.equal(result.ok, true)
  const stale = evaluateAgentStream(parsed.events, {
    ...EXPECTED,
    waivers: [{ findingFingerprint: "nope" }],
  })
  assert.equal(stale.ok, false)
})

test("malformed, missing complete, mismatch, rate limit, billing, skipped, unknown, error, count", () => {
  const cases = [
    ["local-malformed.jsonl", "malformed_jsonl", true],
    ["local-missing-complete.jsonl", "missing_complete", false],
    ["local-reviewed-mismatch.jsonl", "reviewed_files_mismatch", false],
    ["local-rate-limit.jsonl", "rate_limited", false],
    ["local-billing.jsonl", "billing", false],
    ["local-skipped.jsonl", "review_skipped", false],
    ["local-unknown-terminal.jsonl", "unknown_terminal", false],
    ["local-error.jsonl", "error", false],
    ["local-count-mismatch.jsonl", "finding_count_mismatch", false],
    ["local-missing-context.jsonl", "missing_review_context", false],
    ["local-scope-mismatch.jsonl", "scope_mismatch", false],
  ]
  for (const [file, reason, parseFail] of cases) {
    const parsed = loadEvents(file)
    if (parseFail) {
      assert.equal(parsed.ok, false, file)
      assert.equal(parsed.reason, reason, file)
      continue
    }
    assert.equal(parsed.ok, true, file)
    const result = evaluateAgentStream(parsed.events, EXPECTED)
    assert.equal(result.ok, false, file)
    assert.equal(result.reason, reason, file)
  }
})

test("pinned US auth rejects version and region mismatch", () => {
  const good = assertPinnedUsAuth({
    version: "0.7.6",
    auth: { authenticated: true, region: "us" },
  })
  assert.equal(good.ok, true)
  assert.equal(
    assertPinnedUsAuth({
      version: "v0.7.6",
      auth: { authenticated: true, region: "us" },
    }).ok,
    true,
  )
  assert.equal(
    assertPinnedUsAuth({
      version: "0.7.5",
      auth: { authenticated: true, region: "us" },
    }).reason,
    "version_mismatch",
  )
  assert.equal(
    assertPinnedUsAuth({
      version: PINNED_CLI_VERSION,
      auth: { authenticated: true, region: "other" },
    }).reason,
    "region_mismatch",
  )
  assert.equal(
    assertPinnedUsAuth({
      version: PINNED_CLI_VERSION,
      auth: { authenticated: false, region: "us" },
    }).reason,
    "unauthenticated",
  )
})

test("review command is uncommitted+untracked with policy config and never --use-credits", () => {
  const args = reviewCommandArgs({
    owningSpec: "docs/specs/dev-toolchain.md",
    base: "staging",
  })
  assert.deepEqual(args.slice(0, 4), [
    "review",
    "--agent",
    "--uncommitted",
    "--include-untracked",
  ])
  assert.ok(args.includes(".cursor/rules/coderabbit-integration.mdc"))
  assert.ok(args.includes("docs/specs/dev-toolchain.md"))
  assert.ok(!args.includes("--use-credits"))
  const src = readFileSync(
    join(
      process.cwd(),
      ".cursor",
      "hooks",
      "lib",
      "coderabbit-review-policy.mjs",
    ),
    "utf8",
  )
  assert.match(src, /Never executes finding\.codegenInstructions/)
  assert.doesNotMatch(src, /\beval\(/)
})

test("resolveCrBinary prefers CODERABBIT_BIN then Windows install path", () => {
  assert.equal(
    resolveCrBinary({ CODERABBIT_BIN: "C:/cr.exe" }, "win32", () => false),
    "C:/cr.exe",
  )
  const win = resolveCrBinary(
    { LOCALAPPDATA: "C:/Users/me/AppData/Local" },
    "win32",
    (p) => String(p).includes("coderabbit"),
  )
  assert.match(win, /cr\.exe$/)
})

test("gate open is receipt-independent while exemption paths stay bounded", () => {
  const manifest = { "lib/example.ts": "abc" }
  const receipt = buildReceipt({
    branch: "sdd/RES-1",
    base: "staging",
    head: "deadbeef",
    manifest,
    configHashes: { ".coderabbit.yaml": "1" },
    reviewedFiles: ["lib/example.ts"],
  })
  assert.equal(
    evaluateGateOpen({
      exemption: null,
      receipt: null,
      dirtyPaths: ["lib/example.ts"],
      dirtyManifest: manifest,
      configHashes: receipt.configHashes,
      head: "deadbeef",
    }).ok,
    true,
  )
  assert.equal(
    evaluateGateOpen({
      exemption: null,
      receipt: {
        ...receipt,
        manifest: { "lib/example.ts": "stale" },
        head: "older",
      },
      dirtyPaths: ["lib/example.ts"],
      dirtyManifest: manifest,
      configHashes: receipt.configHashes,
      head: "deadbeef",
    }).ok,
    true,
  )
  assert.equal(
    evaluateGateOpen({
      exemption: "docs-artifact",
      receipt: null,
      dirtyPaths: ["docs/findings/tech-debt.md"],
      dirtyManifest: {},
      head: "deadbeef",
    }).ok,
    true,
  )
  assert.equal(
    evaluateGateOpen({
      exemption: "docs-artifact",
      receipt: null,
      dirtyPaths: ["lib/example.ts"],
      dirtyManifest: manifest,
      head: "deadbeef",
    }).reason,
    "exempt_path_mismatch",
  )
})

test("git commit ignores audit receipts but preserves TDD and exemption guards", () => {
  const manifest = { "lib/example.ts": "abc" }
  const receipt = {
    ...buildReceipt({
      branch: "sdd/RES-1",
      base: "staging",
      head: "deadbeef",
      manifest,
      configHashes: { ".coderabbit.yaml": "1" },
      reviewedFiles: ["lib/example.ts"],
    }),
    gateOpened: true,
  }
  assert.equal(
    evaluateGitCommitPermission({
      loopRan: true,
      stagedPaths: ["lib/example.ts"],
      stagedManifest: manifest,
      receipt,
      configHashes: receipt.configHashes,
      head: "deadbeef",
    }).deny,
    "tdd",
  )
  assert.equal(
    evaluateGitCommitPermission({
      loopRan: false,
      stagedPaths: ["lib/other.ts"],
      stagedManifest: { "lib/other.ts": "x" },
      receipt,
      configHashes: receipt.configHashes,
      head: "deadbeef",
    }).ok,
    true,
  )
  assert.equal(
    evaluateGitCommitPermission({
      loopRan: false,
      stagedPaths: ["lib/example.ts"],
      stagedManifest: manifest,
      receipt,
      configHashes: receipt.configHashes,
      head: "deadbeef",
    }).ok,
    true,
  )
  assert.equal(
    evaluateGitCommitPermission({
      loopRan: false,
      stagedPaths: ["docs/findings/tech-debt.md"],
      stagedManifest: {},
      receipt: null,
    }).ok,
    true,
  )
  assert.equal(isDocsArtifactPath("docs/verifier-reports/tdd/x.md"), false)
  assert.equal(
    evaluateGitCommitPermission({
      loopRan: false,
      stagedPaths: ["lib/example.ts"],
      stagedManifest: manifest,
      receipt: { ...receipt, gateOpened: false },
    }).ok,
    true,
  )
  assert.equal(
    evaluateGitCommitPermission({
      loopRan: false,
      stagedPaths: ["docs/findings/tech-debt.md"],
      stagedManifest: {},
      receipt,
      configHashes: receipt.configHashes,
      head: "deadbeef",
    }).ok,
    true,
  )
})
