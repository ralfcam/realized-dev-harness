/**
 * Pure PR CodeRabbit policy. US latest-head approval, no non-US CodeRabbit
 * identity, no unresolved CodeRabbit threads, no rate-limit/billing/override
 * markers, and deterministic severity routing for active findings.
 */
import {
  US_APP_ID,
  containsOverrideMarker,
  eventLooksBilling,
  eventLooksRateLimited,
  isUsBotLogin,
} from "./coderabbit-review-policy.mjs"

export { US_APP_ID }

export const US_LATEST_HEAD_CHECK_NAME = "CodeRabbit US latest-head gate"
export const REQUIRED_US_STATUS_CONTEXT = "CodeRabbit"
export const CODERABBIT_PR_SEVERITIES = Object.freeze([
  "critical",
  "major",
  "minor",
  "trivial",
])

export function reviewAuthorLogin(review) {
  return review?.user?.login || review?.author?.login || review?.user || ""
}

export function reviewCommitId(review) {
  return (
    review?.commit_id ||
    review?.commitId ||
    review?.commit?.oid ||
    review?.commit?.sha ||
    ""
  )
}

export function reviewState(review) {
  return String(review?.state || "").toUpperCase()
}

export function checkAppId(run) {
  return Number(run?.app?.id || run?.app_id || 0)
}

export function checkAppSlug(run) {
  return String(run?.app?.slug || run?.app?.name || "").toLowerCase()
}

export function isUsApp(run) {
  return checkAppId(run) === US_APP_ID
}

function isCodeRabbitShaped(value) {
  return /coderabbit/i.test(String(value || ""))
}

function isNonUsCodeRabbitLogin(login) {
  return isCodeRabbitShaped(login) && !isUsBotLogin(login)
}

function isNonUsCodeRabbitApp(run) {
  return isCodeRabbitShaped(checkAppSlug(run)) && !isUsApp(run)
}

function threadComments(thread) {
  return (
    thread?.comments?.nodes || thread?.comments || thread?.commentNodes || []
  )
}

function commentAuthorLogin(comment) {
  return comment?.author?.login || comment?.user?.login || ""
}

function threadHasCommentLogin(thread, matchLogin) {
  return threadComments(thread).some((c) => matchLogin(commentAuthorLogin(c)))
}

export function threadHasCodeRabbit(thread) {
  return threadHasCommentLogin(thread, isUsBotLogin)
}

function threadHasNonUsCodeRabbit(thread) {
  return threadHasCommentLogin(thread, isNonUsCodeRabbitLogin)
}

export function collectOverrideTexts(snapshot) {
  const blobs = []
  for (const c of snapshot.issueComments || []) blobs.push(c.body)
  for (const c of snapshot.reviewComments || []) blobs.push(c.body)
  for (const r of snapshot.reviews || []) blobs.push(r.body)
  return blobs.filter(Boolean)
}

export function parseCodeRabbitSeverity(body) {
  const header = String(body || "").split(/\r?\n/, 1)[0]
  const match = header.match(
    /\|\s*_[^_\r\n]*?(Critical|Major|Minor|Trivial)[^_\r\n]*_/i,
  )
  return match ? match[1].toLowerCase() : null
}

export function parseCodeRabbitTitle(body) {
  const match = String(body || "").match(/\*\*([^*\r\n]+)\*\*/)
  return match ? match[1].trim().slice(0, 200) : "CodeRabbit finding"
}

export function codeRabbitFindingId(comment, thread = {}) {
  const body = String(comment?.body || "")
  const tagged = body.match(/<!--\s*cr-comment:v1:([^\s>]+)\s*-->/i)
  if (tagged) return `cr-comment:v1:${tagged[1]}`
  const providerId =
    comment?.databaseId || comment?.id || thread?.databaseId || thread?.id || ""
  return providerId ? `github:${providerId}` : "unidentified"
}

export function classifyFindingRouting(finding, { inScopePaths = [] } = {}) {
  const file = String(finding.fileName || finding.file || "")
  if (finding.inScope === true) {
    return { route: "sdd-to-tdd", command: "/sdd-to-tdd" }
  }
  if (inScopePaths.length > 0) {
    const inScope = inScopePaths.some(
      (p) => file === p || file.startsWith(`${p}/`) || p.startsWith(file),
    )
    return inScope
      ? { route: "sdd-to-tdd", command: "/sdd-to-tdd" }
      : { route: "capture", command: "/capture" }
  }

  const severity = String(
    finding?.severity || parseCodeRabbitSeverity(finding?.body) || "",
  ).toLowerCase()
  const levels = {
    critical: "blocker",
    major: "high",
    minor: "medium",
    trivial: "low",
  }
  const known = CODERABBIT_PR_SEVERITIES.includes(severity)
  const high = severity === "critical" || severity === "major" || !known
  return {
    severity: known ? severity : "unknown",
    level: levels[severity] || "blocker",
    route: high ? "sdd-to-tdd" : "capture",
    command: high ? "/sdd-to-tdd" : "/capture",
  }
}

export function collectActiveCodeRabbitFindings(snapshot) {
  const findings = new Map()
  for (const thread of snapshot?.threads || snapshot?.reviewThreads || []) {
    if (thread?.isResolved === true || !threadHasCodeRabbit(thread)) continue
    const comments = threadComments(thread)
    for (const comment of comments) {
      const login = commentAuthorLogin(comment)
      if (!isUsBotLogin(login)) continue
      const body = String(comment?.body || "")
      const severity = parseCodeRabbitSeverity(body)
      const id = codeRabbitFindingId(comment, thread)
      if (!severity && id === "unidentified") continue
      const routing = classifyFindingRouting({ severity, body })
      findings.set(id, {
        id,
        path: comment?.path || thread?.path || "",
        title: parseCodeRabbitTitle(body),
        ...routing,
      })
    }
  }
  return [...findings.values()]
}

function isNonEmptyTrimmedString(value) {
  return typeof value === "string" && value.trim() !== ""
}

// Adapter-enforced G-CR3 shapes. Keep out of evaluateReadyPr so
// policy snapshots stay shape-agnostic.
export function isAllowedReadyPrShape(base, head) {
  return (
    isNonEmptyTrimmedString(base) &&
    isNonEmptyTrimmedString(head) &&
    ((base === "staging" && head !== "staging" && head !== "main") ||
      (head === "staging" && base === "main"))
  )
}

export function evaluateReadyPr(snapshot, { allowDraft = false } = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "malformed_snapshot" }
  }
  const isDraft = snapshot.isDraft === true || snapshot.pull?.isDraft === true
  if (isDraft && !allowDraft) {
    return { ok: false, reason: "draft" }
  }
  const headSha = String(
    snapshot.headSha ||
      snapshot.pull?.headSha ||
      snapshot.pull?.head?.sha ||
      "",
  )
  if (!headSha) return { ok: false, reason: "missing_head" }

  const reviews = snapshot.reviews || []
  const checkRuns = snapshot.checkRuns || snapshot.check_runs || []
  const checkSuites = snapshot.checkSuites || snapshot.check_suites || []
  const issueComments = snapshot.issueComments || []
  const reviewComments = snapshot.reviewComments || []

  // Reviews, checks, issue/inline comment authors: wrong_bot before
  // rate/billing/unresolved routing.
  if (
    reviews.some((r) => isNonUsCodeRabbitLogin(reviewAuthorLogin(r))) ||
    [...checkRuns, ...checkSuites].some(isNonUsCodeRabbitApp) ||
    [...issueComments, ...reviewComments].some((c) =>
      isNonUsCodeRabbitLogin(commentAuthorLogin(c)),
    )
  ) {
    return { ok: false, reason: "wrong_bot" }
  }

  for (const run of checkRuns) {
    const blob = `${run.name || ""} ${run.output?.title || ""} ${run.output?.summary || ""} ${run.output?.text || ""}`
    const synthetic = {
      type: "status",
      status: run.conclusion || run.status,
      message: blob,
      name: run.name,
    }
    if (
      eventLooksRateLimited(synthetic) ||
      RATE_NAME(run.name) ||
      RATE_NAME(blob)
    ) {
      return { ok: false, reason: "rate_limited" }
    }
    if (eventLooksBilling(synthetic) || BILL_NAME(blob)) {
      return { ok: false, reason: "billing" }
    }
  }

  const overrideText = collectOverrideTexts(snapshot).find(
    containsOverrideMarker,
  )
  if (overrideText) {
    return { ok: false, reason: "explicit_override" }
  }

  const threads = snapshot.threads || snapshot.reviewThreads || []
  // Non-US thread identity is wrong_bot before US-bot unresolved routing.
  if (threads.some(threadHasNonUsCodeRabbit)) {
    return { ok: false, reason: "wrong_bot" }
  }
  const unresolved = threads.filter(
    (t) => t.isResolved !== true && threadHasCodeRabbit(t),
  )
  if (unresolved.length) {
    return {
      ok: false,
      reason: "unresolved_threads",
      unresolvedThreadCount: unresolved.length,
      findings: collectActiveCodeRabbitFindings(snapshot),
    }
  }

  const usReviews = reviews.filter((r) => isUsBotLogin(reviewAuthorLogin(r)))
  const onHead = usReviews.filter((r) => reviewCommitId(r) === headSha)
  const ranked = onHead.filter((r) =>
    ["APPROVED", "CHANGES_REQUESTED"].includes(reviewState(r)),
  )
  if (!ranked.length) {
    const otherApproval = reviews.find(
      (r) =>
        reviewState(r) === "APPROVED" && !isUsBotLogin(reviewAuthorLogin(r)),
    )
    if (!usReviews.length && otherApproval) {
      return { ok: false, reason: "wrong_bot" }
    }
    return {
      ok: false,
      reason: usReviews.length > 0 ? "stale_approval" : "pending",
    }
  }
  const latest = ranked[ranked.length - 1]
  if (reviewState(latest) !== "APPROVED") {
    return {
      ok: false,
      reason:
        reviewState(latest) === "CHANGES_REQUESTED"
          ? "changes_requested"
          : "pending",
      state: reviewState(latest),
    }
  }

  return {
    ok: true,
    reason: "clean",
    headSha,
    commitId: reviewCommitId(latest),
    isDraft,
    usAppId: US_APP_ID,
    checkName: US_LATEST_HEAD_CHECK_NAME,
    statusContext: REQUIRED_US_STATUS_CONTEXT,
  }
}

function RATE_NAME(text) {
  return /rate[\s_-]*limit/i.test(String(text || ""))
}

function BILL_NAME(text) {
  return /billing|usage[-\s]?credit/i.test(String(text || ""))
}
