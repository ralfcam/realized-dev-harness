import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import {
  extractProjectSlug,
  extractVersionKey,
  isResOwned,
  resolvePinnedProject,
  selectVersionProjects,
} from "../hooks/lib/linear-project-routing-policy.mjs"

const ROOT = process.cwd()
const DECORATED_NAME = "restaurant-system V-0.2 (Features Enhancing)"
const DECORATED_SLUG = "restaurant-system-v-02-features-enhancing-4b49445c1129"
const OVERVIEW_URL = `https://linear.app/realized/project/${DECORATED_SLUG}/overview`
const ISSUES_URL = `https://linear.app/realized/project/${DECORATED_SLUG}/issues?layout=list&pane=insights`
const RES = (name, extra = {}) => ({
  name,
  team: { key: "RES", name: "Restaurant Link" },
  terminal: false,
  ...extra,
})

test("extractVersionKey accepts an exact V-X.X display name", () => {
  assert.equal(extractVersionKey("V-0.2"), "V-0.2")
  assert.equal(extractVersionKey("  V-1.3  "), "V-1.3")
})

test("extractVersionKey extracts one standalone token from a decorated name", () => {
  assert.equal(extractVersionKey(DECORATED_NAME), "V-0.2")
})

test("extractVersionKey canonicalizes a lowercase v token", () => {
  assert.equal(extractVersionKey("restaurant-system v-0.2"), "V-0.2")
})

test("extractVersionKey treats repeated identical tokens as one key", () => {
  assert.equal(extractVersionKey("V-0.2 and v-0.2"), "V-0.2")
})

test("extractVersionKey does not infer identity from the human-readable slug", () => {
  assert.equal(extractVersionKey(DECORATED_SLUG), null)
})

test("extractProjectSlug canonicalizes overview, issues, and query URLs", () => {
  assert.equal(extractProjectSlug(OVERVIEW_URL), DECORATED_SLUG)
  assert.equal(extractProjectSlug(ISSUES_URL), DECORATED_SLUG)
  assert.equal(
    extractProjectSlug(
      "https://linear.app/realized/project/v-1-2-a1b2c3/issues?layout=list&pane=insights",
    ),
    "v-1-2-a1b2c3",
  )
  assert.equal(
    extractProjectSlug("https://linear.app/realized/issue/RES-1"),
    null,
  )
})

test("RES team key is authoritative across live display names", () => {
  assert.equal(
    isResOwned({
      name: DECORATED_NAME,
      team: { key: "RES", name: "Restaurant Link" },
    }),
    true,
  )
  assert.equal(
    isResOwned({
      name: DECORATED_NAME,
      team: { key: "RES", name: "Realized" },
    }),
    true,
  )
  assert.equal(
    isResOwned({
      name: DECORATED_NAME,
      team: { key: "OPS", name: "Realized" },
    }),
    false,
  )
})

test("selectVersionProjects rejects duplicate canonical keys", () => {
  const result = selectVersionProjects([
    RES(DECORATED_NAME, { slug: DECORATED_SLUG }),
    RES("V-0.2", { slug: "v-0-2-aaaa" }),
  ])
  assert.equal(result.ok, false)
  assert.equal(result.reason, "duplicate-canonical-key")
  assert.equal(result.versionKey, "V-0.2")
})

test("selectVersionProjects keeps a unique decorated RES project", () => {
  const result = selectVersionProjects([
    RES(DECORATED_NAME, { slug: DECORATED_SLUG }),
    RES("Platform backlog"),
    {
      name: "V-0.2",
      team: { key: "OPS", name: "Ops" },
      slug: "other-v-02",
    },
    RES("V-0.2 (old)", { slug: "old-v-02", terminal: true }),
  ])
  assert.equal(result.ok, true)
  assert.equal(result.projects.length, 1)
  assert.equal(result.projects[0].versionKey, "V-0.2")
  assert.equal(result.projects[0].slug, DECORATED_SLUG)
})

test("resolvePinnedProject uses exact slug then display-name versionKey", () => {
  const projects = [RES(DECORATED_NAME, { slug: DECORATED_SLUG })]
  const fromUrl = resolvePinnedProject(OVERVIEW_URL, projects)
  assert.equal(fromUrl.ok, true)
  assert.equal(fromUrl.versionKey, "V-0.2")
  assert.equal(fromUrl.slug, DECORATED_SLUG)

  const fromIssues = resolvePinnedProject(ISSUES_URL, projects)
  assert.equal(fromIssues.ok, true)
  assert.equal(fromIssues.slug, DECORATED_SLUG)

  const fromKey = resolvePinnedProject("V-0.2", projects)
  assert.equal(fromKey.ok, true)
  assert.equal(fromKey.slug, DECORATED_SLUG)

  const fromName = resolvePinnedProject(DECORATED_NAME, projects)
  assert.equal(fromName.ok, true)
  assert.equal(fromName.slug, DECORATED_SLUG)

  const fromBareSlug = resolvePinnedProject(DECORATED_SLUG, projects)
  assert.equal(fromBareSlug.ok, false)
})

test("resolvePinnedProject rejects terminal, non-RES, and ambiguous pins", () => {
  assert.equal(
    resolvePinnedProject(OVERVIEW_URL, [
      RES(DECORATED_NAME, { slug: DECORATED_SLUG, terminal: true }),
    ]).reason,
    "terminal-project",
  )
  assert.equal(
    resolvePinnedProject(OVERVIEW_URL, [
      {
        name: DECORATED_NAME,
        slug: DECORATED_SLUG,
        team: { key: "OPS", name: "Restaurant Link" },
      },
    ]).reason,
    "non-res-ownership",
  )
  assert.equal(
    resolvePinnedProject("V-0.2", [
      RES(DECORATED_NAME, { slug: DECORATED_SLUG }),
      RES("Also V-0.2 here", { slug: "other" }),
    ]).reason,
    "duplicate-canonical-key",
  )
})

test("resolvePinnedProject fails closed on duplicate keys before exact URL or name", () => {
  const projects = [
    RES(DECORATED_NAME, { slug: DECORATED_SLUG, id: "decorated" }),
    RES("V-0.2", { slug: "v-0-2-aaaa", id: "bare" }),
  ]
  for (const input of [OVERVIEW_URL, ISSUES_URL, DECORATED_NAME]) {
    const result = resolvePinnedProject(input, projects)
    assert.equal(result.ok, false, input)
    assert.equal(result.reason, "duplicate-canonical-key", input)
    assert.equal(result.versionKey, "V-0.2", input)
    assert.deepEqual(result.projects, [])
  }
})

test("resolvePinnedProject preserves terminal and non-RES rejection beside a valid set", () => {
  const ongoing = RES("V-0.3", { slug: "v-03", id: "ongoing" })
  assert.equal(
    resolvePinnedProject(OVERVIEW_URL, [
      ongoing,
      RES(DECORATED_NAME, { slug: DECORATED_SLUG, terminal: true }),
    ]).reason,
    "terminal-project",
  )
  assert.equal(
    resolvePinnedProject(OVERVIEW_URL, [
      ongoing,
      {
        name: DECORATED_NAME,
        slug: DECORATED_SLUG,
        team: { key: "OPS", name: "Restaurant Link" },
      },
    ]).reason,
    "non-res-ownership",
  )
})

test("resolvePinnedProject returns a project from the supplied discovery array", () => {
  const pinned = RES(DECORATED_NAME, { slug: DECORATED_SLUG, id: "from-run" })
  const other = RES("V-0.3", { slug: "v-03", id: "other" })
  const projects = [pinned, other]
  const fromUrl = resolvePinnedProject(OVERVIEW_URL, projects)
  assert.equal(fromUrl.ok, true)
  assert.equal(fromUrl.project, pinned)
  const fromIssues = resolvePinnedProject(ISSUES_URL, projects)
  assert.equal(fromIssues.ok, true)
  assert.equal(fromIssues.project, pinned)
  const fromName = resolvePinnedProject(DECORATED_NAME, projects)
  assert.equal(fromName.ok, true)
  assert.equal(fromName.project, pinned)
  const fromKey = resolvePinnedProject("V-0.2", projects)
  assert.equal(fromKey.ok, true)
  assert.equal(fromKey.project, pinned)
})

test("routing-scopes decorated fixture matches live overview identity", () => {
  const fixtures = JSON.parse(
    readFileSync(
      join(ROOT, ".cursor", "checks", "fixtures", "routing-scopes.json"),
      "utf8",
    ),
  )
  const decorated = fixtures.find(
    (fixture) =>
      fixture.name ===
      "decorated overview URL resolves by exact slug then versionKey",
  )
  assert.ok(decorated)
  assert.equal(
    extractProjectSlug(decorated.input),
    decorated.expectedProjectSlug,
  )
  assert.equal(
    extractVersionKey(decorated.expectedDisplayName),
    decorated.expectedVersionKey,
  )
  assert.equal(decorated.expectedTeamKey, "RES")
})
