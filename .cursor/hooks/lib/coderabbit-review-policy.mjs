/**
 * Pure CodeRabbit local-review policy: JSONL stream, scoped dirty-tree
 * manifest and ignored audit receipt.
 *
 * Never executes finding.codegenInstructions. Never passes --use-credits.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

export const PINNED_CLI_VERSION = "0.7.6"
export const REQUIRED_REGION = "us"
export const US_APP_ID = 347564
export const US_BOT_LOGINS = Object.freeze([
  "coderabbitai[bot]",
  "coderabbitai",
])
export const BLOCKING_SEVERITIES = Object.freeze(["critical", "major", "minor"])
export const KNOWN_EVENT_TYPES = Object.freeze([
  "finding",
  "review_context",
  "status",
  "heartbeat",
  "complete",
  "error",
])
export const POLICY_REL = ".cursor/rules/coderabbit-integration.mdc"
export const YAML_REL = ".coderabbit.yaml"
export const RECEIPT_FILENAME = "coderabbit-receipt.json"
export const WAIVERS_FILENAME = "coderabbit-waivers.json"
export const DEFAULT_REVIEW_TIMEOUT_MS = 480_000

const SECRET_PATH_RE =
  /(?:^|\/)(?:\.env(?:\..*)?|.*credentials.*|.*secret.*|id_rsa|id_ed25519)(?:$)|(?:^|\/)[^/]+\.(?:pem|key|p12|pfx)$/i

const RATE_LIMIT_RE = /rate[\s_-]*limit/i
const BILLING_RE =
  /billing|usage[-\s]?credit|confirm(?:ation)?[^\n]{0,40}usage/i
const OVERRIDE_RE =
  /@coderabbitai\s+(?:approve|resolve)\b|ignore pre-merge checks/i

export function receiptPath(stateDir = defaultStateDir()) {
  return join(stateDir, RECEIPT_FILENAME)
}

export function waiversPath(stateDir = defaultStateDir()) {
  return join(stateDir, WAIVERS_FILENAME)
}

export function defaultStateDir() {
  if (process.env.CODERABBIT_STATE_DIR) return process.env.CODERABBIT_STATE_DIR
  return join(__dirname, "..", "state")
}

export function posixPath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
}

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex")
}

export function isSecretPath(relPath) {
  const p = posixPath(relPath)
  if (!p) return false
  if (p.startsWith(".cursor/hooks/state/")) return false
  return SECRET_PATH_RE.test(p)
}

export function isBlockingSeverity(severity) {
  return BLOCKING_SEVERITIES.includes(String(severity || "").toLowerCase())
}

export function isUsBotLogin(login) {
  return US_BOT_LOGINS.includes(String(login || "").toLowerCase())
}

export function parseGitPorcelain(text) {
  const paths = []
  if (typeof text !== "string" || !text.trim()) return paths
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 4) continue
    const body = line.slice(3)
    const renamed = /^[A-Z]?R/.test(line.slice(0, 2)) || line[0] === "R"
    const copied = line[0] === "C" || line[1] === "C"
    let file = body
    if (renamed || copied) {
      const parts = body.split(" -> ")
      file = parts[parts.length - 1]
    }
    file = file.replace(/^"/, "").replace(/"$/, "")
    paths.push(posixPath(file))
  }
  return paths
}

export function unrelatedDirtyPaths(dirtyPaths, expectedPaths) {
  const expected = new Set((expectedPaths || []).map(posixPath))
  return (dirtyPaths || []).map(posixPath).filter((p) => p && !expected.has(p))
}

function findingRelPath(finding) {
  return posixPath(finding.fileName || finding.file || "")
}

function findingBody(finding) {
  return String(
    finding.comment || finding.codegenInstructions || finding.body || "",
  )
}

export function findingFingerprint(finding) {
  const file = findingRelPath(finding)
  const severity = String(finding.severity || "")
  return sha256Hex(`${file}|${severity}|${findingBody(finding)}`)
}

export function findingId(finding) {
  if (finding && typeof finding.id === "string" && finding.id.trim()) {
    return finding.id.trim()
  }
  return `fp:${findingFingerprint(finding)}`
}

export function parseAuthStatus(raw) {
  let obj
  try {
    obj = typeof raw === "string" ? JSON.parse(raw) : raw
  } catch {
    return { ok: false, reason: "malformed_auth" }
  }
  if (!obj || typeof obj !== "object") {
    return { ok: false, reason: "malformed_auth" }
  }
  const authenticated = obj.authenticated === true
  const region = String(obj.region || "").toLowerCase()
  if (!authenticated) return { ok: false, reason: "unauthenticated", region }
  if (region !== REQUIRED_REGION) {
    return { ok: false, reason: "region_mismatch", region }
  }
  return { ok: true, region, authenticated: true }
}

export function assertPinnedUsAuth({ version, auth }) {
  const ver = String(version || "")
    .trim()
    .replace(/^v/i, "")
  if (ver !== PINNED_CLI_VERSION) {
    return { ok: false, reason: "version_mismatch", version: ver }
  }
  const parsed = parseAuthStatus(auth)
  if (!parsed.ok) return parsed
  return { ok: true, version: ver, region: parsed.region }
}

export function parseJsonl(text) {
  const events = []
  if (typeof text !== "string") {
    return { ok: false, reason: "malformed_jsonl", events }
  }
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const event = JSON.parse(line)
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        return {
          ok: false,
          reason: "malformed_jsonl",
          events,
          line: i + 1,
        }
      }
      events.push(event)
    } catch {
      return { ok: false, reason: "malformed_jsonl", events, line: i + 1 }
    }
  }
  return { ok: true, events }
}

export function eventLooksRateLimited(event) {
  if (!event || typeof event !== "object") return false
  if (event.type === "rate_limit") return true
  const blob = JSON.stringify(event)
  return RATE_LIMIT_RE.test(blob)
}

export function eventLooksBilling(event) {
  if (!event || typeof event !== "object") return false
  if (event.type === "billing") return true
  const blob = JSON.stringify(event)
  return BILLING_RE.test(blob)
}

export function eventLooksSkipped(event) {
  if (!event || typeof event !== "object") return false
  return (
    event.status === "review_skipped" ||
    event.type === "skipped" ||
    /no changes detected/i.test(String(event.message || ""))
  )
}

function sortedPaths(paths) {
  return [...new Set((paths || []).map(posixPath).filter(Boolean))].sort()
}

function isOmittedOrEmptyFileList(files) {
  return files === undefined || (Array.isArray(files) && files.length === 0)
}

export function pathsEqual(a, b) {
  const left = sortedPaths(a)
  const right = sortedPaths(b)
  return JSON.stringify(left) === JSON.stringify(right)
}

export function applyWaivers(findings, waivers) {
  const waiverSet = new Set(
    (waivers || [])
      .map((w) => w && w.findingFingerprint)
      .filter((fp) => typeof fp === "string" && fp),
  )
  const blocking = []
  const waived = []
  const nonBlocking = []
  for (const finding of findings || []) {
    const fp = findingFingerprint(finding)
    const id = findingId(finding)
    const row = { ...finding, id, fingerprint: fp }
    if (!isBlockingSeverity(finding.severity)) {
      nonBlocking.push(row)
      continue
    }
    if (waiverSet.has(fp)) {
      waived.push(row)
      continue
    }
    blocking.push(row)
  }
  return { blocking, waived, nonBlocking }
}

export function evaluateAgentStream(events, expected = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, reason: "malformed_jsonl", findings: [] }
  }

  const known = new Set(KNOWN_EVENT_TYPES)
  const findings = []
  let reviewContext = null
  let complete = null
  let sawError = null
  let skipped = false
  let rateLimited = false
  let billing = false

  for (const event of events) {
    const type = event && event.type
    if (!type || !known.has(type)) {
      if (eventLooksRateLimited(event)) {
        return { ok: false, reason: "rate_limited", findings }
      }
      if (eventLooksBilling(event)) {
        return { ok: false, reason: "billing", findings }
      }
      return { ok: false, reason: "unknown_terminal", event }
    }
    if (eventLooksRateLimited(event)) rateLimited = true
    if (eventLooksBilling(event)) billing = true
    if (eventLooksSkipped(event)) skipped = true
    if (type === "error") sawError = event
    if (type === "finding") findings.push(event)
    if (type === "review_context") reviewContext = event
    if (type === "complete") complete = event
  }

  if (rateLimited) return { ok: false, reason: "rate_limited", findings }
  if (billing) return { ok: false, reason: "billing", findings }
  if (sawError) return { ok: false, reason: "error", findings, error: sawError }
  if (!reviewContext) {
    return { ok: false, reason: "missing_review_context", findings }
  }
  if (!complete) return { ok: false, reason: "missing_complete", findings }
  if (skipped || eventLooksSkipped(complete)) {
    return { ok: false, reason: "review_skipped", findings, complete }
  }

  const expectedPaths = sortedPaths(expected.reviewablePaths)
  const contextAliases = [
    reviewContext.reviewedFiles,
    reviewContext.files,
    reviewContext.filesToReview,
  ]
  const completeFiles = complete.reviewedFiles
  const dualOmission =
    contextAliases.every(isOmittedOrEmptyFileList) &&
    isOmittedOrEmptyFileList(completeFiles)
  for (const aliasFiles of contextAliases) {
    if (isOmittedOrEmptyFileList(aliasFiles)) continue
    if (!Array.isArray(aliasFiles) || !pathsEqual(aliasFiles, expectedPaths)) {
      return {
        ok: false,
        reason: "scope_mismatch",
        findings,
        expected: expectedPaths,
        actual: Array.isArray(aliasFiles) ? sortedPaths(aliasFiles) : [],
      }
    }
  }
  if (expected.base && reviewContext.base) {
    if (String(reviewContext.base) !== String(expected.base)) {
      return {
        ok: false,
        reason: "scope_mismatch",
        findings,
        expectedBase: expected.base,
        actualBase: reviewContext.base,
      }
    }
  }

  const reviewedFiles = dualOmission ? expectedPaths : completeFiles
  if (!dualOmission) {
    if (!Array.isArray(reviewedFiles)) {
      return {
        ok: false,
        reason: "reviewed_files_mismatch",
        findings,
        complete,
      }
    }
    if (!pathsEqual(reviewedFiles, expectedPaths)) {
      return {
        ok: false,
        reason: "reviewed_files_mismatch",
        findings,
        expected: expectedPaths,
        actual: sortedPaths(reviewedFiles),
      }
    }
  }

  const declaredCount =
    typeof complete.findings === "number"
      ? complete.findings
      : Array.isArray(complete.findings)
        ? complete.findings.length
        : null
  if (declaredCount == null || declaredCount !== findings.length) {
    return {
      ok: false,
      reason: "finding_count_mismatch",
      findings,
      declaredCount,
      actual: findings.length,
    }
  }

  const reviewableSet = new Set(expectedPaths)
  const findingPaths = findings.map(findingRelPath)
  if (!findingPaths.every((file) => reviewableSet.has(file))) {
    return {
      ok: false,
      reason: "scope_mismatch",
      findings,
      expected: expectedPaths,
      actual: findingPaths,
    }
  }

  const waived = applyWaivers(findings, expected.waivers)
  if (waived.blocking.length) {
    return {
      ok: false,
      reason: "unresolved_findings",
      findings,
      blocking: waived.blocking,
      waived: waived.waived,
      nonBlocking: waived.nonBlocking,
      reviewedFiles: sortedPaths(reviewedFiles),
    }
  }

  return {
    ok: true,
    reason: "clean",
    findings,
    reviewedFiles: sortedPaths(reviewedFiles),
    blocking: [],
    waived: waived.waived,
    nonBlocking: waived.nonBlocking,
    complete,
    reviewContext,
  }
}

export function evaluateWorkOrder({ dirtyPaths, expectedPaths }) {
  const dirty = sortedPaths(dirtyPaths)
  const secrets = dirty.filter(isSecretPath)
  if (secrets.length) {
    return { ok: false, reason: "secret_path", paths: secrets }
  }
  if (!dirty.length) {
    return { ok: false, reason: "no_reviewable_paths", paths: [] }
  }
  const unrelated = unrelatedDirtyPaths(dirty, expectedPaths)
  if (unrelated.length) {
    return { ok: false, reason: "unrelated_dirt", paths: unrelated }
  }
  return { ok: true, reviewablePaths: dirty }
}

export function hashPathContents(cwd, relPaths, readFile = readFileSync) {
  const manifest = {}
  for (const rel of sortedPaths(relPaths)) {
    const abs = join(cwd, rel)
    if (!existsSync(abs)) {
      manifest[rel] = null
      continue
    }
    manifest[rel] = sha256Hex(readFile(abs))
  }
  return manifest
}

export function configHashes(cwd, readFile = readFileSync) {
  const files = [YAML_REL, POLICY_REL]
  const hashes = {}
  for (const rel of files) {
    const abs = join(cwd, rel)
    hashes[rel] = existsSync(abs) ? sha256Hex(readFile(abs)) : null
  }
  return hashes
}

export function buildReceipt({
  cliVersion = PINNED_CLI_VERSION,
  region = REQUIRED_REGION,
  attemptStatus = "clean",
  reason = "clean",
  branch,
  base,
  head,
  manifest,
  configHashes: hashes,
  reviewedFiles,
  findings = [],
  blocking = [],
  waived = [],
  nonBlocking = [],
  owningSpec,
}) {
  const findingIds = (findings || []).map(findingId)
  const disposition = (finding) => ({
    id: findingId(finding),
    fingerprint: findingFingerprint(finding),
    severity: String(finding.severity || "").toLowerCase() || null,
    file: findingRelPath(finding) || null,
  })
  return {
    schema: 2,
    cliVersion,
    region,
    attemptStatus,
    reason,
    branch,
    base,
    head,
    manifest,
    attemptedFiles: sortedPaths(Object.keys(manifest || {})),
    configHashes: hashes,
    reviewedFiles: sortedPaths(reviewedFiles),
    findingIds,
    dispositions: {
      blocking: (blocking || []).map(disposition),
      waived: (waived || []).map(disposition),
      nonBlocking: (nonBlocking || []).map(disposition),
    },
    owningSpec: owningSpec || null,
    createdAt: new Date().toISOString(),
  }
}

export function loadJsonFile(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

export function saveJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export function loadReceipt(stateDir) {
  return loadJsonFile(receiptPath(stateDir), null)
}

export function saveReceipt(stateDir, receipt) {
  saveJsonFile(receiptPath(stateDir), receipt)
  return receipt
}

export function loadWaivers(stateDir) {
  const raw = loadJsonFile(waiversPath(stateDir), [])
  return Array.isArray(raw) ? raw : []
}

export function gitCapture(args, cwd = process.cwd()) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  })
  if (r.status !== 0) return ""
  return r.stdout || ""
}

export function currentHead(cwd = process.cwd()) {
  return gitCapture(["rev-parse", "HEAD"], cwd).trim()
}

export function currentBranch(cwd = process.cwd()) {
  return gitCapture(["branch", "--show-current"], cwd).trim()
}

export function dirtyPathsFromGit(cwd = process.cwd()) {
  return parseGitPorcelain(gitCapture(["status", "--porcelain", "-uall"], cwd))
}

export function resolveDirtyPaths(cwd = process.cwd(), env = process.env) {
  if (Object.hasOwn(env, "CODERABBIT_STUB_DIRTY")) {
    return env.CODERABBIT_STUB_DIRTY.split(",")
      .map((s) => posixPath(s.trim()))
      .filter(Boolean)
  }
  return dirtyPathsFromGit(cwd)
}

export function resolveHead(cwd = process.cwd(), env = process.env) {
  if (env.CODERABBIT_STUB_HEAD) return env.CODERABBIT_STUB_HEAD
  return currentHead(cwd)
}

export function resolveManifest(cwd, relPaths, env = process.env) {
  if (env.CODERABBIT_STUB_MANIFEST) {
    return JSON.parse(env.CODERABBIT_STUB_MANIFEST)
  }
  return hashPathContents(cwd, relPaths)
}

export function resolveCrBinary(
  env = process.env,
  platform = process.platform,
  exists = existsSync,
) {
  if (env.CODERABBIT_BIN) return env.CODERABBIT_BIN
  if (platform === "win32") {
    const local = join(
      env.LOCALAPPDATA || "",
      "Programs",
      "coderabbit",
      "cr.exe",
    )
    if (local && exists(local)) return local
    return "cr"
  }
  const home = env.HOME || env.USERPROFILE || ""
  const local = join(home, ".local", "bin", "coderabbit")
  if (home && exists(local)) return local
  const cr = join(home, ".local", "bin", "cr")
  if (home && exists(cr)) return cr
  return "coderabbit"
}

export function reviewCommandArgs({ owningSpec, base, extraConfig = [] }) {
  const configs = [owningSpec, POLICY_REL, ...extraConfig].filter(Boolean)
  const args = ["review", "--agent", "--uncommitted", "--include-untracked"]
  for (const file of configs) {
    args.push("-c", file)
  }
  if (base) args.push("--base", base)
  return args
}

export function containsOverrideMarker(text) {
  return OVERRIDE_RE.test(String(text || ""))
}

export { OVERRIDE_RE, RATE_LIMIT_RE, BILLING_RE }
