#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { writeFileAtomic } from "./io.mjs"

const STATES = new Set([
  "triage",
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
  "canceled",
])
const PRIORITIES = new Set(["critical", "high", "medium", "low"])
const PRIORITY_ORDER = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
])

function parseArgs(argv) {
  argv = argv.filter((arg) => arg !== "--")
  const command = argv[0]
  const options = { dryRun: false }
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dry-run") options.dryRun = true
    else if (["--id", "--title", "--priority", "--spec", "--state"].includes(arg)) {
      if (!argv[index + 1]) throw new Error(`${arg} requires a value`)
      options[arg.slice(2)] = argv[index + 1]
      index += 1
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  return { command, options }
}

function validateId(id) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error("Work-item id must be a lowercase slug.")
  }
  return id
}

function splitConcept(text) {
  if (!text.startsWith("---\n")) throw new Error("Concept is missing frontmatter.")
  const end = text.indexOf("\n---\n", 4)
  if (end === -1) throw new Error("Concept frontmatter is not closed.")
  return {
    data: parseYaml(text.slice(4, end)),
    body: text.slice(end + 5),
  }
}

function renderConcept(data, body) {
  return `---\n${stringifyYaml(data, { lineWidth: 0 }).trimEnd()}\n---\n${body}`
}

function conceptPath(root, id) {
  return join(root, "docs", "work-items", `${validateId(id)}.md`)
}

function resolveSpec(root, spec) {
  if (typeof spec !== "string" || !spec.startsWith("/specs/") || !spec.endsWith(".md")) {
    throw new Error("Specification must be a bundle path such as /specs/example.md.")
  }
  const specsRoot = resolve(root, "docs", "specs")
  const path = resolve(root, "docs", spec.slice(1))
  const fromSpecs = relative(specsRoot, path)
  if (fromSpecs.startsWith("..") || isAbsolute(fromSpecs)) {
    throw new Error("Specification path must remain under /specs/.")
  }
  if (!existsSync(path)) throw new Error(`Specification does not exist: ${spec}`)
  const concept = splitConcept(readFileSync(path, "utf8"))
  if (concept.data?.type !== "Specification") {
    throw new Error(`Specification must have type Specification: ${spec}`)
  }
  return path
}

function updateGenerated(data, now) {
  return {
    ...data,
    generated: {
      by: "process:realized-dev-harness-work-items",
      at: now().toISOString(),
    },
  }
}

function updateIndex(root, id, title) {
  const path = join(root, "docs", "work-items", "index.md")
  const line = `* [${title.replace(/[\[\]]/g, "")}](${id}.md) - Canonical work item.`
  const current = readFileSync(path, "utf8").trimEnd()
  if (current.includes(`](${id}.md)`)) return
  writeFileAtomic(path, `${current}\n${line}\n`)
}

export function createWorkItem(root, options, { now = () => new Date() } = {}) {
  const id = validateId(options.id)
  if (!options.title?.trim()) throw new Error("--title is required.")
  if (!PRIORITIES.has(options.priority)) throw new Error("Invalid --priority.")
  resolveSpec(root, options.spec)
  const path = conceptPath(root, id)
  if (existsSync(path)) throw new Error(`Work item already exists: ${id}`)
  const data = updateGenerated(
    {
      type: "Work Item",
      title: options.title.trim(),
      description: `Tracks the ${options.title.trim()} outcome.`,
      tags: ["work-item"],
      status: "draft",
      workflow_state: "backlog",
      priority: options.priority,
      spec: options.spec,
    },
    now,
  )
  writeFileAtomic(path, renderConcept(data, "\n# Outcome\n\nDefine the independently verifiable outcome.\n"))
  updateIndex(root, id, options.title.trim())
  return { id, path, workflow_state: "backlog", priority: options.priority }
}

export function triageWorkItem(root, options, { now = () => new Date() } = {}) {
  const path = conceptPath(root, options.id)
  if (!existsSync(path)) throw new Error(`Unknown work item: ${options.id}`)
  if (!options.state && !options.priority) {
    throw new Error("Triage requires --state or --priority.")
  }
  if (options.state && !STATES.has(options.state)) throw new Error("Invalid --state.")
  if (options.priority && !PRIORITIES.has(options.priority)) throw new Error("Invalid --priority.")
  const concept = splitConcept(readFileSync(path, "utf8"))
  if (concept.data?.type !== "Work Item") throw new Error("Target is not a Work Item.")
  if (concept.data.spec) resolveSpec(root, concept.data.spec)
  const data = updateGenerated(
    {
      ...concept.data,
      ...(options.state ? { workflow_state: options.state } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
    },
    now,
  )
  writeFileAtomic(path, renderConcept(data, concept.body))
  return { id: options.id, workflow_state: data.workflow_state, priority: data.priority }
}

function readWorkItems(root) {
  const directory = join(root, "docs", "work-items")
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md") && !["index.md", "template.md"].includes(name))
    .map((name) => {
      const path = join(directory, name)
      const concept = splitConcept(readFileSync(path, "utf8"))
      return { id: name.slice(0, -3), path, ...concept }
    })
    .filter((item) => item.data?.type === "Work Item")
}

export function dispatchWorkItems(
  root,
  options = {},
  { now = () => new Date() } = {},
) {
  const config = JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf8"))
  const items = readWorkItems(root)
  const active = items.filter((item) =>
    ["in_progress", "in_review"].includes(item.data.workflow_state),
  ).length
  const capacity = Math.max(0, config.dispatch.maximumActive - active)
  const selected = items
    .filter((item) => item.data.workflow_state === "ready")
    .sort(
      (left, right) =>
        (PRIORITY_ORDER.get(left.data.priority) ?? 99) -
          (PRIORITY_ORDER.get(right.data.priority) ?? 99) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, capacity)
  if (!options.dryRun) {
    for (const item of selected) {
      const data = updateGenerated({ ...item.data, workflow_state: "in_progress" }, now)
      writeFileAtomic(item.path, renderConcept(data, item.body))
    }
  }
  return selected.map((item) => ({ id: item.id, priority: item.data.priority }))
}

function main() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2))
    let result
    if (command === "create") result = createWorkItem(process.cwd(), options)
    else if (command === "triage") result = triageWorkItem(process.cwd(), options)
    else if (command === "dispatch") result = dispatchWorkItems(process.cwd(), options)
    else throw new Error("Use create, triage, or dispatch.")
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`work-item: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main()
