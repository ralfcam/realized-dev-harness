#!/usr/bin/env node
/**
 * Read-only GitHub adapter for the US latest-head CodeRabbit gate.
 * The release command may opt into draft verification, but this adapter never
 * comments, writes Linear, readies, commits, pushes, or merges.
 *
 * Usage:
 *   node .cursor/checks/coderabbit-pr-gate.mjs
 *   node .cursor/checks/coderabbit-pr-gate.mjs --owner o --repo r --pr 12
 *   node .cursor/checks/coderabbit-pr-gate.mjs --snapshot path.json
 */
import { readFileSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  evaluateReadyPr,
  isAllowedReadyPrShape,
} from "../hooks/lib/coderabbit-pr-policy.mjs"

const PAGE_SIZE = 100
const MAX_PAGES = 100

function argValue(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

function fail(reason, extra = {}) {
  console.error(JSON.stringify({ ok: false, reason, ...extra }, null, 2))
  process.exit(1)
}

function assertBranchShape(snapshot, promotionOnly) {
  const base = snapshot.pull?.base
  const head = snapshot.pull?.head
  if (
    !isAllowedReadyPrShape(base, head) ||
    (promotionOnly && !(base === "main" && head === "staging"))
  ) {
    fail("wrong_base_head", { base, head })
  }
}

function emitReadyVerdict(snapshot, { allowDraft, promotionOnly }) {
  assertBranchShape(snapshot, promotionOnly)
  const result = evaluateReadyPr(snapshot, { allowDraft })
  if (!result.ok) fail(result.reason, result)
  console.log(JSON.stringify({ ok: true, ...result }, null, 2))
}

function loadEvent() {
  const path = process.env.GITHUB_EVENT_PATH
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

function repoFromEnv() {
  let full = process.env.GITHUB_REPOSITORY || ""
  if (!full) {
    const result = spawnSync(
      "gh",
      ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
      {
        encoding: "utf8",
        shell: process.platform === "win32",
        timeout: 15_000,
      },
    )
    if (result.status === 0) full = String(result.stdout || "").trim()
  }
  const [owner, repo] = full.split("/")
  return { owner, repo }
}

function resolveToken() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (fromEnv) return fromEnv
  const result = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 15_000,
  })
  return result.status === 0 ? String(result.stdout || "").trim() : ""
}

async function ghJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "restaurant-system-coderabbit-pr-gate",
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${url}: ${text}`)
  }
  return res.json()
}

export async function collectRestPages(
  fetchPage,
  { field = null, maxPages = MAX_PAGES } = {},
) {
  const all = []
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await fetchPage(page)
    const items = field ? payload?.[field] : payload
    if (!Array.isArray(items)) {
      throw new Error(`malformed_paginated_response:${field || "array"}`)
    }
    all.push(...items)
    if (items.length < PAGE_SIZE) return all
  }
  throw new Error("pagination_limit")
}

async function ghJsonPages(url, token, field = null) {
  return collectRestPages(
    (page) => {
      const paged = new URL(url)
      paged.searchParams.set("per_page", String(PAGE_SIZE))
      paged.searchParams.set("page", String(page))
      return ghJson(paged.toString(), token)
    },
    { field },
  )
}

async function ghGraphql(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "restaurant-system-coderabbit-pr-gate",
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json()
  if (!res.ok || body.errors) {
    throw new Error(JSON.stringify(body.errors || body))
  }
  return body.data
}

const THREADS_QUERY = `
query ($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              id
              databaseId
              author { login }
              body
              path
              line
            }
          }
        }
      }
    }
  }
}
`

export async function collectGraphqlPages(
  fetchPage,
  { maxPages = MAX_PAGES } = {},
) {
  const all = []
  let after = null
  for (let page = 1; page <= maxPages; page += 1) {
    const connection = await fetchPage(after)
    if (!connection || !Array.isArray(connection.nodes)) {
      throw new Error("malformed_graphql_connection")
    }
    if (
      connection.nodes.some(
        (node) => node?.comments?.pageInfo?.hasNextPage === true,
      )
    ) {
      throw new Error("review_thread_comment_pagination")
    }
    all.push(...connection.nodes)
    if (!connection.pageInfo?.hasNextPage) return all
    after = connection.pageInfo?.endCursor
    if (!after) throw new Error("missing_graphql_cursor")
  }
  throw new Error("pagination_limit")
}

async function fetchReviewThreads({ owner, repo, number, token }) {
  return collectGraphqlPages(async (after) => {
    const data = await ghGraphql(token, THREADS_QUERY, {
      owner,
      name: repo,
      number,
      after,
    })
    return data?.repository?.pullRequest?.reviewThreads
  })
}

export async function fetchSnapshot({ owner, repo, number, token }) {
  const repoApi = `https://api.github.com/repos/${owner}/${repo}`
  const pull = await ghJson(`${repoApi}/pulls/${number}`, token)
  const headSha = pull.head?.sha
  const [
    reviews,
    issueComments,
    reviewComments,
    checkRuns,
    checkSuites,
    threads,
  ] = await Promise.all([
    ghJsonPages(`${repoApi}/pulls/${number}/reviews`, token),
    ghJsonPages(`${repoApi}/issues/${number}/comments`, token),
    ghJsonPages(`${repoApi}/pulls/${number}/comments`, token),
    headSha
      ? ghJsonPages(
          `${repoApi}/commits/${headSha}/check-runs`,
          token,
          "check_runs",
        )
      : [],
    headSha
      ? ghJsonPages(
          `${repoApi}/commits/${headSha}/check-suites`,
          token,
          "check_suites",
        )
      : [],
    fetchReviewThreads({ owner, repo, number, token }),
  ])
  const currentPull = await ghJson(`${repoApi}/pulls/${number}`, token)
  if (currentPull.head?.sha !== headSha) {
    throw new Error("head_changed")
  }
  if (
    currentPull.head?.ref !== pull.head?.ref ||
    currentPull.base?.ref !== pull.base?.ref ||
    currentPull.draft !== pull.draft
  ) {
    throw new Error("pull_changed")
  }
  return {
    isDraft: pull.draft === true,
    pull: {
      number: pull.number,
      isDraft: pull.draft === true,
      base: pull.base?.ref,
      head: pull.head?.ref,
      headSha,
    },
    headSha,
    reviews,
    issueComments,
    reviewComments,
    checkRuns,
    checkSuites,
    threads,
  }
}

async function main() {
  const snapshotPath = argValue("--snapshot")
  const allowDraft = process.argv.includes("--allow-draft")
  const promotionOnly =
    process.argv.includes("--promotion-only") ||
    process.env.CODERABBIT_PR_PROMOTION_ONLY === "1"

  if (snapshotPath) {
    emitReadyVerdict(JSON.parse(readFileSync(snapshotPath, "utf8")), {
      allowDraft,
      promotionOnly,
    })
    return
  }

  const event = loadEvent()
  const fromEnv = repoFromEnv()
  const owner = argValue("--owner") || fromEnv.owner
  const repo = argValue("--repo") || fromEnv.repo
  const number = Number(
    argValue("--pr") || event?.pull_request?.number || event?.number || 0,
  )
  if (!owner || !repo || !number) fail("missing_pr")

  const token = resolveToken()
  if (!token) fail("missing_token")
  emitReadyVerdict(await fetchSnapshot({ owner, repo, number, token }), {
    allowDraft,
    promotionOnly,
  })
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((err) =>
    fail(
      err.message === "head_changed" || err.message === "pull_changed"
        ? err.message
        : "error",
      {
        message: err.message,
      },
    ),
  )
}
