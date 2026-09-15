/**
 * Pure Linear project-routing extractors.
 *
 * Commands stay governed by .cursor/rules/linear-project-routing.mdc.
 * These helpers pin the executable semantics: exact `/project/<slug>/...`
 * identity, display-name versionKey extraction, RES-key authority, and
 * ambiguity rejection. Live MCP I/O stays in the commands.
 */

export const RES_TEAM_KEY = "RES"

const PROJECT_SLUG_RE = /\/project\/([^/?#]+)/i
const VERSION_TOKEN_RE = /(?<![A-Za-z0-9._])[vV]-(\d+)\.(\d+)(?![A-Za-z0-9.])/g

export function extractProjectSlug(input) {
  if (typeof input !== "string") return null
  const match = input.match(PROJECT_SLUG_RE)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function extractVersionKey(displayName) {
  if (typeof displayName !== "string") return null
  const keys = []
  const re = new RegExp(VERSION_TOKEN_RE.source, "g")
  for (const match of displayName.matchAll(re)) {
    const key = `V-${match[1]}.${match[2]}`
    if (!keys.includes(key)) keys.push(key)
  }
  return keys.length === 1 ? keys[0] : null
}

export function owningTeamKey(team) {
  if (typeof team === "string") return team.toUpperCase()
  if (team && typeof team.key === "string") return team.key.toUpperCase()
  return null
}

export function isResOwned(project, resTeamId = null) {
  if (owningTeamKey(project?.team) === RES_TEAM_KEY) return true
  if (resTeamId && project?.team?.id === resTeamId) return true
  return false
}

function pinnedIdentity(project, resTeamId = null) {
  const versionKey = extractVersionKey(project?.name)
  if (!versionKey) {
    return { ok: false, reason: "no-or-conflicting-version-token" }
  }
  if (!isResOwned(project, resTeamId)) {
    return { ok: false, reason: "non-res-ownership" }
  }
  if (project?.terminal === true) {
    return { ok: false, reason: "terminal-project" }
  }
  return {
    ok: true,
    project,
    versionKey,
    slug: typeof project?.slug === "string" ? project.slug : null,
  }
}

export function selectVersionProjects(projects, resTeamId = null) {
  if (!Array.isArray(projects)) {
    return { ok: false, reason: "cannot-verify", projects: [] }
  }
  const accepted = []
  const seen = new Map()
  for (const project of projects) {
    const identity = pinnedIdentity(project, resTeamId)
    if (!identity.ok) continue
    if (seen.has(identity.versionKey)) {
      return {
        ok: false,
        reason: "duplicate-canonical-key",
        versionKey: identity.versionKey,
        projects: [],
      }
    }
    seen.set(identity.versionKey, project)
    accepted.push({ ...project, versionKey: identity.versionKey })
  }
  return { ok: true, projects: accepted }
}

export function resolvePinnedProject(input, projects, resTeamId = null) {
  if (typeof input !== "string" || !Array.isArray(projects)) {
    return { ok: false, reason: "cannot-verify" }
  }
  // Gate slug, exact display name, and version-key pins on one discovery pass.
  const selected = selectVersionProjects(projects, resTeamId)
  if (!selected.ok) return selected

  const trimmed = input.trim()
  const slug = extractProjectSlug(trimmed)
  if (slug) {
    const matches = projects.filter((project) => project?.slug === slug)
    if (matches.length !== 1) {
      return {
        ok: false,
        reason: matches.length === 0 ? "unresolved-slug" : "ambiguous-slug",
      }
    }
    return pinnedIdentity(matches[0], resTeamId)
  }

  const exact = projects.filter(
    (project) =>
      typeof project?.name === "string" && project.name.trim() === trimmed,
  )
  if (exact.length === 1) return pinnedIdentity(exact[0], resTeamId)
  if (exact.length > 1) return { ok: false, reason: "ambiguous-display-name" }

  const versionKey = extractVersionKey(trimmed)
  if (!versionKey) return { ok: false, reason: "unresolved" }
  const keyed = selected.projects.filter(
    (project) => project.versionKey === versionKey,
  )
  if (keyed.length === 1) {
    const original = projects.find((project) => {
      const identity = pinnedIdentity(project, resTeamId)
      return identity.ok && identity.versionKey === versionKey
    })
    if (!original) return { ok: false, reason: "unresolved" }
    return {
      ok: true,
      project: original,
      versionKey,
      slug: typeof original.slug === "string" ? original.slug : null,
    }
  }
  return {
    ok: false,
    reason: keyed.length === 0 ? "unresolved" : "ambiguous-version-key",
  }
}
