import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { devNull } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  AUDIT_SCOPE_KEY_COMPONENTS,
  AUDIT_SCOPE_KEY_NEEDLES,
  CLARIFY_ONLY_CAPTURE_FORBIDDEN,
  CLARIFY_ONLY_CAPTURE_NEEDLES,
  CLARIFY_STATE_FORBIDDEN,
  CLARIFY_STATE_UNCHANGED_NEEDLE,
  CLARIFY_STATE_UNCHANGED_RELS,
  DESIGN_WRITE_WHITELIST_FORBIDDEN,
  DESIGN_WRITE_WHITELIST_NEEDLES,
  DISPATCH_PORTFOLIO_NEEDLES,
  DISPATCH_REGRESSION_PATTERNS,
  GROOM_ARTIFACT_NEEDLES,
  GROOM_STALE_NEEDLES,
  RUN_FILE_LIFECYCLE_NEEDLES,
  detectActiveRoutingTextViolations,
  detectAuditScopeKeyViolations,
  detectClarifyOnlyCaptureViolations,
  detectClarifyStateWordingViolations,
  detectDesignWriteWhitelistViolations,
  detectDispatchPortfolioViolations,
  detectGroomArtifactViolations,
  detectGroomStaleGuardViolations,
  detectRunFileLifecycleViolations,
  CODERABBIT_MIRROR_FORBIDDEN,
  CODERABBIT_MIRROR_NEEDLES,
  CODERABBIT_YAML_REQUIRED,
  CODERABBIT_YAML_FORBIDDEN,
  CODERABBIT_WORKFLOW_NEEDLES,
  CODERABBIT_WORKFLOW_FORBIDDEN,
  detectCoderabbitMirrorViolations,
  detectCoderabbitYamlViolations,
  detectCoderabbitWorkflowViolations,
} from "./harness-lint.mjs"
import {
  DAILY_QUEUE_MAXIMUM,
  DAILY_QUEUE_MINIMUM,
  calculateDailyQueueCapacity,
} from "../hooks/lib/dispatch-capacity-policy.mjs"
import { runPnpm } from "./run-pnpm.mjs"

const ROOT = process.cwd()

test("harness-lint.mjs exists and exits 0 on this tree", () => {
  const script = join(ROOT, ".cursor", "checks", "harness-lint.mjs")
  assert.equal(existsSync(script), true)
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" })
  assert.equal(r.status, 0, r.stderr || r.stdout)
})

test("task-fanout.mdc pins the same cap as the policy constant", () => {
  const rule = readFileSync(
    join(ROOT, ".cursor", "rules", "task-fanout.mdc"),
    "utf8",
  )
  const policy = readFileSync(
    join(ROOT, ".cursor", "hooks", "lib", "task-fanout-policy.mjs"),
    "utf8",
  )
  const ruleN = /TASK_FANOUT_INFLIGHT_CAP\s*=\s*(\d+)/.exec(rule)
  const polN = /export const TASK_FANOUT_INFLIGHT_CAP\s*=\s*(\d+)/.exec(policy)
  assert.ok(ruleN && polN)
  assert.equal(ruleN[1], polN[1])
})

test("unformatted markdown fixture fails prettier --check", () => {
  const fixture = join(ROOT, ".cursor", "checks", "fixtures", "unformatted.md")
  assert.equal(existsSync(fixture), true)
  const r = runPnpm(
    ["exec", "prettier", "--check", "--ignore-path", devNull, fixture],
    { cwd: ROOT },
  )
  assert.notEqual(r.status, 0, r.stderr || r.stdout)
})

test("run-pnpm uses installed prettier CLI, not win32 pnpm.cmd", () => {
  const src = readFileSync(
    join(ROOT, ".cursor", "checks", "run-pnpm.mjs"),
    "utf8",
  )
  assert.ok(src.includes("node_modules"))
  assert.ok(src.includes("prettier.cjs"))
  assert.ok(src.includes("Cloud Agents are Linux"))
  assert.ok(!src.includes('? "pnpm.cmd"'))
})

test("harness-lint source pins findings-format and prettier --check", () => {
  const src = readFileSync(
    join(ROOT, ".cursor", "checks", "harness-lint.mjs"),
    "utf8",
  )
  assert.ok(src.includes("findings-format"))
  assert.ok(src.includes("pm-workflow"))
  assert.ok(src.includes("milestone-routing"))
  assert.ok(src.includes("clarify"))
  assert.ok(src.includes("groom-stale"))
  assert.ok(src.includes("groom-artifacts"))
  assert.ok(src.includes("audit-scope-key"))
  assert.ok(src.includes("clarify-only"))
  assert.ok(src.includes("design-writes"))
  assert.ok(src.includes("run-ledger"))
  assert.ok(src.includes("clarify-state"))
  assert.ok(src.includes("coderabbit"))
  assert.ok(src.includes("prettier --check"))
  assert.ok(src.includes("runPnpm"))
  assert.ok(!src.includes('? "pnpm.cmd"'))
})

test("routing lint rejects legacy identity and hardcoded Linear project defaults", () => {
  const legacyPrefix = ["REA", "ZED"].join("")
  const bad = [
    `Default project: https://linear.app/realized/project/legacy-a1b2`,
    `Issue: ${legacyPrefix}-123`,
  ].join("\n")
  const violations = detectActiveRoutingTextViolations(
    ".cursor/commands/triage.md",
    bad,
  )
  assert.equal(violations.length, 2)
  assert.deepEqual(
    detectActiveRoutingTextViolations(
      ".cursor/commands/triage.md",
      "Fixed team Realized (RES). Discover V-X.X with list_projects.",
    ),
    [],
  )
})

test("routing scope fixtures cover every normalized invocation edge", () => {
  const fixtures = JSON.parse(
    readFileSync(
      join(ROOT, ".cursor", "checks", "fixtures", "routing-scopes.json"),
      "utf8",
    ),
  )
  assert.deepEqual(
    fixtures.map(({ name }) => name),
    [
      "project issues-view URL with layout and query",
      "multiline Markdown issue list preserves ordered first occurrences",
      "duplicates malformed and mixed-team entries fail closed",
      "project plus list is an intersection boundary",
      "dispatch explicit list receives full portfolio outcomes",
      "daily activation counts current-cycle Todo toward maximum",
      "repeated daily activation at maximum promotes nothing",
      "targeted audit derives scope from listed issue hubs",
      "decorated overview URL resolves by exact slug then versionKey",
    ],
  )
  assert.deepEqual(fixtures[1].expectedIssueIds, ["RES-42", "RES-7"])
  assert.deepEqual(fixtures[2].expectedRejected, ["OPS-9", "RES-nope"])
  assert.deepEqual(
    fixtures[4].expectedPortfolioOutcomeIds,
    fixtures[4].expectedIssueIds,
  )
  assert.deepEqual(
    fixtures[4].expectedMetadataScopeIds,
    fixtures[4].expectedIssueIds,
  )
  assert.deepEqual(fixtures[4].expectedNonWaveIds, ["RES-3", "RES-4", "RES-5"])
  assert.equal(fixtures[4].expectedNonWaveState, "Backlog")
  assert.equal(fixtures[4].expectedNonWaveCycle, null)
  const portfolioCapacity = calculateDailyQueueCapacity(
    fixtures[4].existingActiveCount,
    fixtures[4].eligibleReadyIds.length,
  )
  assert.equal(
    portfolioCapacity.activationCount,
    fixtures[4].expectedActivationSlots,
  )
  assert.deepEqual(
    fixtures[4].expectedActivationIds,
    fixtures[4].eligibleReadyIds.slice(0, fixtures[4].expectedActivationSlots),
  )
  assert.match(fixtures[4].expectedCloudBehavior, /optional advice only/)
  assert.match(fixtures[4].expectedCardGate, /post-apply/)

  const capacity = calculateDailyQueueCapacity(
    fixtures[5].existingActiveCount,
    fixtures[5].eligibleReadyCount,
  )
  assert.equal(DAILY_QUEUE_MINIMUM, fixtures[5].expectedMinimum)
  assert.equal(DAILY_QUEUE_MAXIMUM, fixtures[5].expectedMaximum)
  assert.equal(capacity.activationCount, fixtures[5].expectedActivationSlots)
  assert.equal(
    capacity.projectedActiveCount,
    fixtures[5].expectedProjectedActiveCount,
  )

  const repeated = calculateDailyQueueCapacity(
    fixtures[6].existingActiveCount,
    fixtures[6].eligibleReadyCount,
  )
  assert.equal(repeated.activationCount, 0)
  assert.equal(repeated.projectedActiveCount, 10)
  assert.match(fixtures[7].expectedBehavior, /omitted specs are out of scope/)
  assert.equal(
    fixtures[8].expectedProjectSlug,
    "restaurant-system-v-02-features-enhancing-4b49445c1129",
  )
  assert.equal(fixtures[8].expectedVersionKey, "V-0.2")
  assert.equal(
    fixtures[8].expectedDisplayName,
    "restaurant-system V-0.2 (Features Enhancing)",
  )
})

test("shared routing rule pins RES-key authority and versionKey extraction", () => {
  const rule = readFileSync(
    join(ROOT, ".cursor", "rules", "linear-project-routing.mdc"),
    "utf8",
  )
  assert.ok(!rule.includes("`^V-\\d+\\.\\d+$`"))
  for (const needle of [
    "owning team key/UUID is RES",
    "`versionKey`",
    "standalone",
    "`list_projects`",
    "paginate until exhausted",
    "Never infer identity from the human-readable slug",
    "multiple distinct tokens",
    "duplicate canonical keys",
    "**ongoing**",
    "**available**",
    "Fail closed",
    "explicit valid pinned project",
    "existing nonterminal RES version project",
    "project of its parent or issue that blocks it",
    "descriptions/labels plus milestone compatibility",
    "earliest compatible available version",
  ]) {
    assert.ok(rule.includes(needle), `routing rule must contain ${needle}`)
  }
})

test("PM commands normalize exact scopes and preserve hard boundaries", () => {
  const triage = readFileSync(
    join(ROOT, ".cursor", "commands", "triage.md"),
    "utf8",
  )
  const dispatch = readFileSync(
    join(ROOT, ".cursor", "commands", "dispatch.md"),
    "utf8",
  )
  const audit = readFileSync(
    join(ROOT, ".cursor", "commands", "audit.md"),
    "utf8",
  )
  for (const text of [triage, dispatch, audit]) {
    assert.ok(text.includes("/project/<slug>/..."))
    assert.ok(text.includes("multiline Markdown"))
    assert.ok(text.includes("get_issue"))
    assert.ok(text.includes("non-RES"))
    assert.ok(text.includes("canonical version key"))
    assert.ok(text.includes("exact slug"))
    assert.ok(text.includes("versionKey"))
  }
  assert.ok(triage.includes("explicit issues: read exactly"))
  assert.match(dispatch, /explicit list is the complete\s+candidate pool/)
  assert.ok(dispatch.includes("final tie-break"))
  assert.ok(audit.includes("hub-walk only those listed issues"))
  assert.ok(audit.includes("omitted spec"))
})

test("dispatch.md pins includeRelations and verified-negative", () => {
  const dispatch = readFileSync(
    join(ROOT, ".cursor", "commands", "dispatch.md"),
    "utf8",
  )
  assert.ok(dispatch.includes("includeRelations"))
  assert.ok(dispatch.includes("verified negative"))
  assert.ok(dispatch.includes("cannot verify` is for tool/MCP failure"))
})

test("PM harness assigns intake to triage and split portfolio/daily scopes to dispatch", () => {
  const triage = readFileSync(
    join(ROOT, ".cursor", "commands", "triage.md"),
    "utf8",
  )
  assert.ok(triage.includes('state: "triage"'))
  assert.ok(triage.includes("Linear Triage is an intake inbox"))
  assert.ok(triage.includes("Ordinary accepted work"))
  assert.ok(triage.includes("Urgent fast lane"))
  assert.ok(
    /ordinary intake\s+leaves portfolio metadata and daily-wave activation for `\/dispatch`/.test(
      triage,
    ),
  )
  assert.ok(!triage.includes('There is **no "Triage" state'))
  assert.ok(!triage.includes("Inspect all open issues in parallel"))
  assert.ok(!triage.includes("`backfill-*`"))

  const dispatch = readFileSync(
    join(ROOT, ".cursor", "commands", "dispatch.md"),
    "utf8",
  )
  for (const needle of [
    "groom-portfolio",
    "activate-daily-wave",
    "emit-daily-plan",
    "Every scoped Backlog issue",
    "existing daily queue",
    "preferred minimum total active = **5**",
    "hard maximum total active = **10**",
    "Backlog → Todo",
    "Cloud parallelization recommendations",
    "post-apply re-read",
  ]) {
    assert.ok(dispatch.includes(needle), `dispatch must contain ${needle}`)
  }
  assert.ok(!dispatch.includes("There is no execution phase"))
  assert.ok(!dispatch.includes("card is the whole deliverable"))
})

test("audit and resolver pin idempotent project-health visibility", () => {
  const audit = readFileSync(
    join(ROOT, ".cursor", "commands", "audit.md"),
    "utf8",
  )
  for (const needle of [
    "Source of truth — docs/specs/ ONLY",
    "FINAL — PROJECT HEALTH VISIBILITY",
    "Audit run key:",
    "get_status_updates",
    "save_status_update",
    "`onTrack`",
    "`atRisk`",
    "`offTrack`",
    "`/projects/all`",
  ]) {
    assert.ok(audit.includes(needle), `audit must contain ${needle}`)
  }
  assert.ok(
    audit.indexOf("FINAL — PROJECT HEALTH VISIBILITY") >
      audit.indexOf("PART 8"),
  )

  const resolver = readFileSync(
    join(ROOT, ".cursor", "agents", "linear-resolver.md"),
    "utf8",
  )
  assert.ok(resolver.includes("`/triage` or `/dispatch`"))
  assert.ok(resolver.includes("## Workflow — PROJECT-UPDATE"))
  assert.ok(resolver.includes("may call only `get_status_updates` and"))
  assert.ok(resolver.includes("Audit run key: <same key>"))
  assert.ok(resolver.includes("Do not call `get_project`, `save_project`"))
})

test("doctrine mirrors the intake and scheduling flow", () => {
  const findings = readFileSync(
    join(ROOT, "docs", "findings", "README.md"),
    "utf8",
  )
  const staging = readFileSync(
    join(ROOT, ".cursor", "rules", "staging-accumulator.mdc"),
    "utf8",
  )
  const automation = readFileSync(
    join(ROOT, ".cursor", "rules", "linear-automation.mdc"),
    "utf8",
  )
  assert.ok(findings.includes("docs/findings + Linear Triage"))
  assert.ok(findings.includes("A `blocked-by` relation"))
  assert.ok(staging.includes("post-apply re-read must confirm"))
  assert.ok(staging.includes("full approved"))
  assert.ok(staging.includes("Backlog scope"))
  assert.ok(staging.includes("hard maximum is 10"))
  assert.ok(staging.includes("recommendation evidence only"))
  assert.ok(automation.includes("narrowly shared by `/triage` and `/dispatch`"))
  assert.ok(automation.includes("promotes a non-wave issue"))
  assert.match(automation, /Project health is not an\s+issue workflow state/)
})

test("sdd-to-tdd.md pins managed Cloud one-shot contract", () => {
  const cmd = readFileSync(
    join(ROOT, ".cursor", "commands", "sdd-to-tdd.md"),
    "utf8",
  )
  assert.ok(cmd.includes("/v1/meta-data/agent/runtime"))
  assert.ok(cmd.includes("exactly `managed`"))
  assert.ok(cmd.includes(".cursor/plans/<plan-slug>.plan.md"))
  assert.ok(
    cmd.includes(
      "repository work-order, not a silently accepted native Cursor Plan",
    ),
  )
  assert.ok(cmd.includes("Cloud one-shot does not waive"))
  assert.ok(cmd.includes("do not auto-confirm"))
  assert.ok(cmd.includes("Do **not** invoke `CreatePlan`"))
  assert.ok(cmd.includes("unattended Agent-mode launches"))
})

function walk(dir, ext, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, ext, acc)
    else if (p.endsWith(ext)) acc.push(p)
  }
  return acc
}

test("linear-automation.mdc pins automation-only execution statuses", () => {
  const rule = readFileSync(
    join(ROOT, ".cursor", "rules", "linear-automation.mdc"),
    "utf8",
  )
  assert.ok(rule.includes("No execution-status writes"))
  assert.ok(rule.includes("START is comment-only"))
  assert.match(rule, /PR ready for merge[\s\S]*?In Review/)
  assert.ok(!rule.includes("→ No action"))
  assert.ok(!/START is the (only |primary )?In Progress/.test(rule))
  assert.ok(rule.includes("There is no START carve-out"))
})

test("linear-resolver START is comment-only", () => {
  const agent = readFileSync(
    join(ROOT, ".cursor", "agents", "linear-resolver.md"),
    "utf8",
  )
  assert.ok(agent.includes("Never set an execution status in any mode"))
  assert.ok(agent.includes("START must not call `save_issue`"))
  assert.ok(!agent.includes('state: "In Progress"'))
  assert.ok(!agent.includes("START is the only In Progress write"))
  assert.ok(!agent.includes("Moved:"))
})

test("sdd-to-tdd.md pins managed Cloud TDD → commit → push continuation", () => {
  const cmd = readFileSync(
    join(ROOT, ".cursor", "commands", "sdd-to-tdd.md"),
    "utf8",
  )
  assert.ok(cmd.includes("STEP 4F"))
  assert.ok(cmd.includes(".cursor/commands/commit.md"))
  assert.ok(cmd.includes(".cursor/commands/push.md"))
  assert.ok(cmd.includes("Never `gh pr ready`"))
  assert.ok(cmd.includes("Never `gh pr merge`"))
  assert.ok(cmd.includes("point the operator to `/commit`"))
  assert.ok(cmd.includes("START does **not** write workflow state"))
})

test("design and sdd-to-tdd validate work-type milestone routes", () => {
  const design = readFileSync(
    join(ROOT, ".cursor", "commands", "design.md"),
    "utf8",
  )
  assert.ok(design.includes("pre-implementation work in M1–M3 only"))
  assert.ok(design.includes("M1 for genuine"))
  assert.ok(design.includes("M2 for requirements/spec"))
  assert.ok(design.includes("M3 — architecture"))
  assert.ok(design.includes("blocks the later"))

  const sdd = readFileSync(
    join(ROOT, ".cursor", "commands", "sdd-to-tdd.md"),
    "utf8",
  )
  assert.ok(sdd.includes("Route by the work being performed"))
  assert.ok(sdd.includes("M2 — Requirements Sign-Off"))
  assert.ok(sdd.includes("M4 — Code Complete"))
  assert.ok(sdd.includes("Do not impose a blanket M4+"))
  assert.ok(sdd.includes("M5, M6, M7, M8, and"))
  assert.ok(
    sdd.includes("decision/design issue blocks the implementation issue"),
  )
})

test("CLARIFY is resolver-only, bounded, idempotent, and comment-only", () => {
  const resolver = readFileSync(
    join(ROOT, ".cursor", "agents", "linear-resolver.md"),
    "utf8",
  )
  const clarify = resolver.match(
    /## Workflow — CLARIFY([\s\S]*?)## Workflow — START/,
  )?.[1]
  assert.ok(clarify)
  for (const needle of [
    "only `list_comments` and",
    "`save_comment`",
    "Clarification required",
    "clarify:<RES-id>:<spec-basename>:<rule-or-ac>",
    "START_SUMMARY_MAX_CHARS",
    "identical unresolved key",
    "materially changed spec evidence",
    "different rule/criterion",
    "Do not call Slack",
    "must never",
  ]) {
    assert.ok(clarify.includes(needle), `CLARIFY must contain ${needle}`)
  }
  assert.ok(clarify.includes("never changes state"))
  assert.ok(clarify.includes("Do not call `get_issue`"))

  for (const name of [
    "triage.md",
    "dispatch.md",
    "design.md",
    "sdd-to-tdd.md",
    "capture.md",
  ]) {
    const text = readFileSync(join(ROOT, ".cursor", "commands", name), "utf8")
    assert.ok(text.includes("linear-resolver"))
    assert.ok(text.includes("CLARIFY"))
    assert.ok(text.includes("Clarification required"))
  }
})

test("active harness prose emits RES identity while Vercel keeps its project slug", () => {
  const files = [
    join(ROOT, ".cursor", "README.md"),
    join(ROOT, "docs", "findings", "README.md"),
    ...walk(join(ROOT, ".cursor", "rules"), ".mdc"),
    ...walk(join(ROOT, ".cursor", "commands"), ".md"),
    ...walk(join(ROOT, ".cursor", "agents"), ".md"),
  ]
  const legacy = new RegExp(`\\b${["REA", "ZED"].join("")}-`, "i")
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), legacy, file)
  }
  const vercel = readFileSync(
    join(ROOT, ".cursor", "rules", "vercel-project.mdc"),
    "utf8",
  )
  assert.ok(vercel.includes("Project slug: `restaurant-system`"))
})

test("active commands/rules/agents do not describe START as an In Progress writer", () => {
  const files = [
    ...walk(join(ROOT, ".cursor", "rules"), ".mdc"),
    ...walk(join(ROOT, ".cursor", "commands"), ".md"),
    ...walk(join(ROOT, ".cursor", "agents"), ".md"),
  ]
  const forbidden = [
    /START is the (only |primary )?In Progress/,
    /START-writable/,
    /START-only/,
    /START populates In Progress/,
    /Backlog\/Todo → In Progress/,
    /PR ready for merge.*No action/,
    /→ No action/,
  ]
  assert.ok(files.length > 0)
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    for (const re of forbidden) {
      const m = text.match(re)
      assert.equal(
        m,
        null,
        `${file} still describes forbidden execution-status ownership: ${m?.[0]}`,
      )
    }
  }
})

function assertMissingClauseNegatives(rel, text, needles, detect) {
  assert.deepEqual(detect(rel, text), [])
  for (const needle of needles) {
    const mutated = text.replaceAll(needle, "")
    const violations = detect(rel, mutated)
    assert.notEqual(
      violations.length,
      0,
      `expected a violation after removing ${needle} from ${rel}`,
    )
    assert.ok(
      violations.some((v) => v.includes(needle)),
      `violation for ${needle} was ${violations.join(" | ")}`,
    )
  }
}

function assertForbiddenClauseNegatives(rel, text, needles, detect) {
  assert.deepEqual(detect(rel, text), [])
  for (const needle of needles) {
    const mutated = `${text}\n${needle}\n`
    const violations = detect(rel, mutated)
    assert.notEqual(
      violations.length,
      0,
      `expected a violation after inserting ${needle} into ${rel}`,
    )
    assert.ok(
      violations.some((v) => v.includes(needle)),
      `violation for ${needle} was ${violations.join(" | ")}`,
    )
  }
}

test("GROOM stale-guard contracts pass live files and fail each missing clause", () => {
  for (const [rel, needles] of Object.entries(GROOM_STALE_NEEDLES)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertMissingClauseNegatives(
      rel,
      text,
      needles,
      detectGroomStaleGuardViolations,
    )
  }
})

test("GROOM artifact contracts pass live files and fail without relation or comment verification", () => {
  for (const [rel, needles] of Object.entries(GROOM_ARTIFACT_NEEDLES)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertMissingClauseNegatives(
      rel,
      text,
      needles,
      detectGroomArtifactViolations,
    )
  }
})

test("dispatch portfolio mirrors pass live files and fail each missing clause", () => {
  for (const [rel, needles] of Object.entries(DISPATCH_PORTFOLIO_NEEDLES)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertMissingClauseNegatives(
      rel,
      text,
      needles,
      detectDispatchPortfolioViolations,
    )
  }
})

test("dispatch negative controls reject legacy cap, non-wave promotion, Cloud spawn, and premature cards", () => {
  const rel = ".cursor/commands/dispatch.md"
  const text = readFileSync(join(ROOT, rel), "utf8")
  assert.deepEqual(detectDispatchPortfolioViolations(rel, text), [])

  const controls = [
    {
      id: "legacy-four-item-cap",
      text: "The combined selected set is therefore at most four issues.",
    },
    {
      id: "non-wave-promotion",
      text: "After grooming, promote non-wave issues.",
    },
    {
      id: "cloud-spawn-authorization",
      text: "Cloud recommendation authorizes agent spawn.",
    },
    {
      id: "pre-confirmation-card",
      text: "Emit cards before Todo/current-cycle confirmation.",
    },
  ]

  assert.deepEqual(
    DISPATCH_REGRESSION_PATTERNS.map(({ id }) => id),
    controls.map(({ id }) => id),
  )
  for (const control of controls) {
    const violations = detectDispatchPortfolioViolations(
      rel,
      `${text}\n${control.text}\n`,
    )
    assert.ok(
      violations.some((violation) => violation.includes(control.id)),
      `expected ${control.id} violation, got ${violations.join(" | ")}`,
    )
  }
})

test("audit scope-key contracts pass live mirrors and fail each missing scope component", () => {
  for (const [rel, needles] of Object.entries(AUDIT_SCOPE_KEY_NEEDLES)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertMissingClauseNegatives(
      rel,
      text,
      needles,
      detectAuditScopeKeyViolations,
    )
  }
  for (const rel of Object.keys(AUDIT_SCOPE_KEY_NEEDLES)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    for (const component of AUDIT_SCOPE_KEY_COMPONENTS) {
      const mutated = text.replaceAll(component, "")
      const violations = detectAuditScopeKeyViolations(rel, mutated)
      assert.notEqual(
        violations.length,
        0,
        `expected a violation after removing ${component} from ${rel}`,
      )
      assert.ok(
        violations.some((v) => v.includes(component)),
        `violation for ${component} was ${violations.join(" | ")}`,
      )
    }
  }
})

test("clarify-only capture contracts pass live file and fail each missing or restored-forbidden clause", () => {
  const rel = ".cursor/commands/capture.md"
  const text = readFileSync(join(ROOT, rel), "utf8")
  assert.deepEqual(detectClarifyOnlyCaptureViolations(text), [])
  for (const needle of CLARIFY_ONLY_CAPTURE_NEEDLES) {
    const mutated = text.replaceAll(needle, "")
    const violations = detectClarifyOnlyCaptureViolations(mutated)
    assert.notEqual(
      violations.length,
      0,
      `expected a violation after removing ${needle}`,
    )
    assert.ok(
      violations.some((v) => v.includes(needle)),
      `violation for ${needle} was ${violations.join(" | ")}`,
    )
  }
  for (const needle of CLARIFY_ONLY_CAPTURE_FORBIDDEN) {
    const mutated = `${text}\n${needle}\n`
    const violations = detectClarifyOnlyCaptureViolations(mutated)
    assert.notEqual(
      violations.length,
      0,
      `expected a violation after inserting ${needle}`,
    )
    assert.ok(violations.some((v) => v.includes(needle)))
  }
})

test("design write-whitelist contracts pass live file and fail each missing or restored-forbidden clause", () => {
  const rel = ".cursor/commands/design.md"
  const text = readFileSync(join(ROOT, rel), "utf8")
  assert.deepEqual(detectDesignWriteWhitelistViolations(text), [])
  for (const needle of DESIGN_WRITE_WHITELIST_NEEDLES) {
    const mutated = text.replaceAll(needle, "")
    const violations = detectDesignWriteWhitelistViolations(mutated)
    assert.notEqual(
      violations.length,
      0,
      `expected a violation after removing ${needle}`,
    )
    assert.ok(
      violations.some((v) => v.includes(needle)),
      `violation for ${needle} was ${violations.join(" | ")}`,
    )
  }
  for (const needle of DESIGN_WRITE_WHITELIST_FORBIDDEN) {
    const mutated = `${text}\n${needle}\n`
    const violations = detectDesignWriteWhitelistViolations(mutated)
    assert.notEqual(
      violations.length,
      0,
      `expected a violation after inserting ${needle}`,
    )
    assert.ok(violations.some((v) => v.includes(needle)))
  }
})

test("run-file lifecycle contracts pass live files and fail each missing clause", () => {
  for (const [rel, needles] of Object.entries(RUN_FILE_LIFECYCLE_NEEDLES)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertMissingClauseNegatives(
      rel,
      text,
      needles,
      detectRunFileLifecycleViolations,
    )
  }
})

test("CLARIFY current-state-unchanged wording passes live files and fails each missing or restored-forbidden clause", () => {
  for (const rel of CLARIFY_STATE_UNCHANGED_RELS) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertMissingClauseNegatives(
      rel,
      text,
      [CLARIFY_STATE_UNCHANGED_NEEDLE],
      detectClarifyStateWordingViolations,
    )
    assertForbiddenClauseNegatives(
      rel,
      text,
      CLARIFY_STATE_FORBIDDEN,
      detectClarifyStateWordingViolations,
    )
  }
})

test("CodeRabbit factory mirrors pass live files and fail each missing clause", () => {
  assert.equal(
    existsSync(join(ROOT, ".cursor", "commands", "ready-merge-release.md")),
    true,
  )
  assert.equal(
    existsSync(join(ROOT, ".cursor", "commands", "coderabbit-gate.md")),
    false,
  )
  for (const [rel, needles] of Object.entries(CODERABBIT_MIRROR_NEEDLES)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertMissingClauseNegatives(
      rel,
      text,
      needles,
      detectCoderabbitMirrorViolations,
    )
  }
  for (const [rel, needles] of Object.entries(CODERABBIT_MIRROR_FORBIDDEN)) {
    const text = readFileSync(join(ROOT, rel), "utf8")
    assertForbiddenClauseNegatives(
      rel,
      text,
      needles,
      detectCoderabbitMirrorViolations,
    )
  }
})

test("CodeRabbit YAML requires draft review and workflow stays read-only", () => {
  const yaml = readFileSync(join(ROOT, ".coderabbit.yaml"), "utf8")
  assert.deepEqual(detectCoderabbitYamlViolations(yaml), [])
  for (const needle of CODERABBIT_YAML_REQUIRED) {
    const violations = detectCoderabbitYamlViolations(
      yaml.replaceAll(needle, ""),
    )
    assert.notEqual(violations.length, 0, needle)
  }
  for (const needle of CODERABBIT_YAML_FORBIDDEN) {
    const violations = detectCoderabbitYamlViolations(`${yaml}\n${needle}\n`)
    assert.notEqual(violations.length, 0, needle)
  }

  const workflow = readFileSync(
    join(ROOT, ".github", "workflows", "coderabbit-main-gate.yml"),
    "utf8",
  )
  assert.deepEqual(detectCoderabbitWorkflowViolations(workflow), [])
  for (const needle of CODERABBIT_WORKFLOW_NEEDLES) {
    const mutated = workflow.replaceAll(needle, "")
    const violations = detectCoderabbitWorkflowViolations(mutated)
    assert.notEqual(violations.length, 0, needle)
  }
  for (const needle of CODERABBIT_WORKFLOW_FORBIDDEN) {
    const violations = detectCoderabbitWorkflowViolations(
      `${workflow}\n${needle}\n`,
    )
    assert.notEqual(violations.length, 0, needle)
  }
})
