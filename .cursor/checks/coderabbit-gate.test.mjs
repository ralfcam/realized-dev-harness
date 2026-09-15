import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, describe, test } from "node:test"
import { tmpdir } from "node:os"
import {
  buildReceipt,
  configHashes,
  loadReceipt,
  receiptPath,
  saveReceipt,
} from "../hooks/lib/coderabbit-review-policy.mjs"

const ROOT = process.cwd()
const FIX = join(ROOT, ".cursor", "checks", "fixtures", "coderabbit")
const TMP_STATE = join(tmpdir(), `cr-gate-state-${process.pid}`)
const RECEIPT = receiptPath(TMP_STATE)
const TDD_STATE = join(ROOT, ".cursor", "hooks", "state", "tdd-guard.json")
const TDD_STATE_PRIOR = existsSync(TDD_STATE)
  ? readFileSync(TDD_STATE, "utf8")
  : null
const WORK_ORDER = join(FIX, "work-order.json")

mkdirSync(TMP_STATE, { recursive: true })

function restoreTdd() {
  if (TDD_STATE_PRIOR == null) {
    if (existsSync(TDD_STATE)) unlinkSync(TDD_STATE)
  } else {
    writeFileSync(TDD_STATE, TDD_STATE_PRIOR, "utf8")
  }
}

function childEnv(extra = {}) {
  return {
    ...process.env,
    CODERABBIT_STATE_DIR: TMP_STATE,
    ...extra,
  }
}

function runGuard(scriptName, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(ROOT, ".cursor", "hooks", scriptName)],
      { env: childEnv() },
    )
    let out = ""
    child.stdout.on("data", (d) => {
      out += d
    })
    child.on("close", (code) => resolve({ code, out }))
    child.on("error", reject)
    child.stdin.end(payload)
  })
}

function runGate(jsonlName, extraEnv = {}) {
  writeFileSync(
    WORK_ORDER,
    JSON.stringify({
      owningSpec: "docs/specs/dev-toolchain.md",
      expectedPaths: ["lib/example.ts"],
      base: "staging",
    }),
    "utf8",
  )
  return spawnSync(
    process.execPath,
    [
      join(ROOT, ".cursor", "checks", "coderabbit-gate.mjs"),
      "--owning-spec",
      "docs/specs/dev-toolchain.md",
      "--work-order",
      WORK_ORDER,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: childEnv({
        CODERABBIT_GATE_TEST: "1",
        CODERABBIT_STUB_DIRTY: "lib/example.ts",
        CODERABBIT_STUB_HEAD: "deadbeef",
        CODERABBIT_STUB_BRANCH: "sdd/RES-1",
        CODERABBIT_STUB_MANIFEST: JSON.stringify({ "lib/example.ts": "abc" }),
        CODERABBIT_STUB_JSONL: join(FIX, jsonlName),
        ...extraEnv,
      }),
    },
  )
}

describe("coderabbit local/remote CLI fixtures", { concurrency: 1 }, () => {
  after(() => {
    restoreTdd()
    if (existsSync(WORK_ORDER)) unlinkSync(WORK_ORDER)
    rmSync(TMP_STATE, { recursive: true, force: true })
  })

  test("clean JSONL fixture writes a US receipt", () => {
    const r = runGate("local-clean.jsonl")
    assert.equal(r.status, 0, r.stderr)
    const body = JSON.parse(r.stdout)
    assert.equal(body.ok, true)
    assert.equal(body.attemptStatus, "clean")
    assert.equal(body.reason, "clean")
    const receipt = loadReceipt(TMP_STATE)
    assert.equal(receipt.cliVersion, "0.7.6")
    assert.equal(receipt.region, "us")
    assert.equal(receipt.head, "deadbeef")
    assert.deepEqual(receipt.reviewedFiles, ["lib/example.ts"])
    assert.equal(receipt.attemptStatus, "clean")
    assert.equal(receipt.reason, "clean")
  })

  test("findings and unavailable review outcomes are advisory audit attempts", () => {
    for (const [file, reason, attemptStatus] of [
      ["local-critical.jsonl", "unresolved_findings", "findings"],
      ["local-major.jsonl", "unresolved_findings", "findings"],
      ["local-minor.jsonl", "unresolved_findings", "findings"],
      ["local-malformed.jsonl", "malformed_jsonl", "unavailable"],
      ["local-missing-complete.jsonl", "missing_complete", "unavailable"],
      [
        "local-reviewed-mismatch.jsonl",
        "reviewed_files_mismatch",
        "unavailable",
      ],
      ["local-rate-limit.jsonl", "rate_limited", "unavailable"],
      ["local-billing.jsonl", "billing", "unavailable"],
      ["local-skipped.jsonl", "review_skipped", "unavailable"],
      ["local-unknown-terminal.jsonl", "unknown_terminal", "unavailable"],
      ["local-error.jsonl", "error", "unavailable"],
      ["local-count-mismatch.jsonl", "finding_count_mismatch", "unavailable"],
      ["local-missing-context.jsonl", "missing_review_context", "unavailable"],
      ["local-scope-mismatch.jsonl", "scope_mismatch", "unavailable"],
    ]) {
      if (existsSync(RECEIPT)) unlinkSync(RECEIPT)
      const r = runGate(file)
      assert.equal(r.status, 0, `${file}: ${r.stderr}`)
      const body = JSON.parse(r.stdout)
      assert.equal(body.reason, reason, file)
      assert.equal(body.attemptStatus, attemptStatus, file)
      const receipt = loadReceipt(TMP_STATE)
      assert.equal(receipt.reason, reason, file)
      assert.equal(receipt.attemptStatus, attemptStatus, file)
      assert.deepEqual(receipt.attemptedFiles, ["lib/example.ts"], file)
      if (attemptStatus === "findings") {
        assert.equal(receipt.dispositions.blocking.length, 1, file)
        assert.match(
          receipt.dispositions.blocking[0].severity,
          /critical|major|minor/,
          file,
        )
      }
    }
  })

  test("non-blocking severity stays visible in advisory receipt metadata", () => {
    const r = runGate("local-trivial.jsonl")
    assert.equal(r.status, 0, r.stderr)
    const receipt = loadReceipt(TMP_STATE)
    assert.equal(receipt.attemptStatus, "findings")
    assert.equal(receipt.reason, "findings")
    assert.equal(receipt.dispositions.blocking.length, 0)
    assert.equal(receipt.dispositions.nonBlocking.length, 1)
    assert.equal(receipt.dispositions.nonBlocking[0].severity, "trivial")
  })

  test("unrelated dirt and secrets stop before review", () => {
    const dirt = runGate("local-clean.jsonl", {
      CODERABBIT_STUB_DIRTY: "lib/example.ts,notes.md",
    })
    assert.notEqual(dirt.status, 0)
    assert.equal(JSON.parse(dirt.stderr).reason, "unrelated_dirt")
    const secret = runGate("local-clean.jsonl", {
      CODERABBIT_STUB_DIRTY: ".env",
    })
    assert.notEqual(secret.status, 0)
    assert.equal(JSON.parse(secret.stderr).reason, "secret_path")
  })

  test("missing or malformed work orders and empty surfaces fail hard", () => {
    const gate = join(ROOT, ".cursor", "checks", "coderabbit-gate.mjs")
    const missing = spawnSync(
      process.execPath,
      [
        gate,
        "--owning-spec",
        "docs/specs/dev-toolchain.md",
        "--work-order",
        join(FIX, "missing-work-order.json"),
      ],
      { cwd: ROOT, encoding: "utf8", env: childEnv() },
    )
    assert.notEqual(missing.status, 0)
    assert.equal(JSON.parse(missing.stderr).reason, "missing_work_order")

    writeFileSync(WORK_ORDER, "{", "utf8")
    const malformed = spawnSync(
      process.execPath,
      [
        gate,
        "--owning-spec",
        "docs/specs/dev-toolchain.md",
        "--work-order",
        WORK_ORDER,
      ],
      { cwd: ROOT, encoding: "utf8", env: childEnv() },
    )
    assert.notEqual(malformed.status, 0)
    assert.equal(JSON.parse(malformed.stderr).reason, "malformed_work_order")

    const empty = runGate("local-clean.jsonl", {
      CODERABBIT_STUB_DIRTY: "",
    })
    assert.notEqual(empty.status, 0)
    assert.equal(JSON.parse(empty.stderr).reason, "no_reviewable_paths")
  })

  test("authentication and setup failures are advisory unavailable attempts", () => {
    const ver = runGate("local-clean.jsonl", {
      CODERABBIT_STUB_VERSION: "0.7.5",
    })
    assert.equal(ver.status, 0, ver.stderr)
    assert.equal(JSON.parse(ver.stdout).reason, "version_mismatch")
    assert.equal(loadReceipt(TMP_STATE).attemptStatus, "unavailable")
    const region = runGate("local-clean.jsonl", {
      CODERABBIT_STUB_AUTH: JSON.stringify({
        authenticated: true,
        region: "other",
      }),
    })
    assert.equal(region.status, 0, region.stderr)
    assert.equal(JSON.parse(region.stdout).reason, "region_mismatch")
    assert.equal(loadReceipt(TMP_STATE).attemptStatus, "unavailable")
  })

  test("review process failures are advisory unavailable attempts", () => {
    const failed = runGate("local-clean.jsonl", {
      CODERABBIT_STUB_REVIEW_ERROR: "1",
    })
    assert.equal(failed.status, 0, failed.stderr)
    assert.equal(JSON.parse(failed.stdout).reason, "error")
    assert.equal(loadReceipt(TMP_STATE).attemptStatus, "unavailable")
  })

  test("changed dirty bytes after an attempted review still fail hard", () => {
    if (existsSync(RECEIPT)) unlinkSync(RECEIPT)
    const changed = runGate("local-major.jsonl", {
      CODERABBIT_STUB_AFTER_MANIFEST: JSON.stringify({
        "lib/example.ts": "changed",
      }),
    })
    assert.notEqual(changed.status, 0)
    assert.equal(JSON.parse(changed.stderr).reason, "changed_bytes")
    assert.equal(existsSync(RECEIPT), false)
  })

  test("pr-gate snapshots: clean passes, pending/rate-limit fail", () => {
    const adapter = join(ROOT, ".cursor", "checks", "coderabbit-pr-gate.mjs")
    const clean = spawnSync(
      process.execPath,
      [adapter, "--snapshot", join(FIX, "remote-clean.json")],
      { encoding: "utf8" },
    )
    assert.equal(clean.status, 0, clean.stderr)
    assert.equal(JSON.parse(clean.stdout).ok, true)
    const pending = spawnSync(
      process.execPath,
      [adapter, "--snapshot", join(FIX, "remote-pending.json")],
      { encoding: "utf8" },
    )
    assert.notEqual(pending.status, 0)
    assert.equal(JSON.parse(pending.stderr).reason, "pending")
    const limited = spawnSync(
      process.execPath,
      [adapter, "--snapshot", join(FIX, "remote-rate-limit.json")],
      { encoding: "utf8" },
    )
    assert.equal(JSON.parse(limited.stderr).reason, "rate_limited")
    const promotion = spawnSync(
      process.execPath,
      [
        adapter,
        "--snapshot",
        join(FIX, "remote-feature.json"),
        "--promotion-only",
      ],
      { encoding: "utf8" },
    )
    assert.notEqual(promotion.status, 0)
    assert.equal(JSON.parse(promotion.stderr).reason, "wrong_base_head")
    const feature = spawnSync(
      process.execPath,
      [adapter, "--snapshot", join(FIX, "remote-feature.json")],
      { encoding: "utf8" },
    )
    assert.equal(feature.status, 0, feature.stderr)
  })
})

const GIT_COMMIT = JSON.stringify({
  tool_name: "Shell",
  tool_input: { command: "git commit -m msg" },
})

describe("coderabbit commit-gate spawn-level", { concurrency: 1 }, () => {
  after(() => {
    restoreTdd()
    rmSync(TMP_STATE, { recursive: true, force: true })
    mkdirSync(TMP_STATE, { recursive: true })
  })

  test("gate open succeeds without a receipt after commit checks pass", () => {
    if (existsSync(RECEIPT)) unlinkSync(RECEIPT)
    writeFileSync(
      TDD_STATE,
      JSON.stringify({ armed: false, depth: 0, phase: null, loopRan: true }),
      "utf8",
    )
    const r = spawnSync(
      process.execPath,
      [join(ROOT, ".cursor", "hooks", "tdd-guard.mjs"), "gate", "open"],
      { cwd: ROOT, encoding: "utf8", env: childEnv() },
    )
    assert.equal(r.status, 0, r.stderr)
    assert.equal(JSON.parse(readFileSync(TDD_STATE, "utf8")).loopRan, false)
  })

  test("gate open succeeds with a stale audit receipt without rebinding it", () => {
    const manifest = { "lib/example.ts": "abc" }
    const receipt = {
      ...buildReceipt({
        branch: "sdd/RES-1",
        base: "staging",
        head: "older",
        manifest: { "lib/example.ts": "older" },
        configHashes: configHashes(ROOT),
        reviewedFiles: ["lib/example.ts"],
      }),
      gateOpened: true,
      gateOpenedAt: "2026-01-01T00:00:00.000Z",
    }
    saveReceipt(TMP_STATE, receipt)
    const r = spawnSync(
      process.execPath,
      [join(ROOT, ".cursor", "hooks", "tdd-guard.mjs"), "gate", "open"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: childEnv({
          CODERABBIT_STUB_DIRTY: "lib/example.ts",
          CODERABBIT_STUB_HEAD: "deadbeef",
          CODERABBIT_STUB_MANIFEST: JSON.stringify(manifest),
        }),
      },
    )
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(loadReceipt(TMP_STATE), receipt)
  })

  test("an old opened receipt cannot ghost-block a later git commit", async () => {
    writeFileSync(
      TDD_STATE,
      JSON.stringify(
        {
          armed: false,
          depth: 0,
          phase: null,
          loopRan: false,
          commitExempt: null,
        },
        null,
        2,
      ),
      "utf8",
    )
    saveReceipt(TMP_STATE, {
      ...buildReceipt({
        branch: "sdd/RES-1",
        base: "staging",
        head: "deadbeef",
        manifest: { "nope.ts": "x" },
        configHashes: configHashes(ROOT),
        reviewedFiles: ["nope.ts"],
      }),
      gateOpened: true,
    })
    const { code, out } = await runGuard(
      "git-stage-guard.mjs",
      `\uFEFF${GIT_COMMIT}`,
    )
    assert.equal(code, 0, out)
    assert.deepEqual(JSON.parse(out), {})
  })
})
