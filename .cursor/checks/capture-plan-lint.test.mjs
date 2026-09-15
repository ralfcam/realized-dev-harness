import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { checkCapturePlan } from "./capture-plan-lint.mjs"

const FIXTURES = join(process.cwd(), ".cursor", "checks", "fixtures")

test("pass fixture has no capture-plan violations", () => {
  const md = readFileSync(join(FIXTURES, "capture-plan-pass.md"), "utf8")
  assert.deepEqual(checkCapturePlan(md), [])
})

test("fail fixture reports date-arrows-utc missing validator row", () => {
  const md = readFileSync(join(FIXTURES, "capture-plan-fail.md"), "utf8")
  assert.deepEqual(checkCapturePlan(md), [
    "capture-plan: slug date-arrows-utc has no validator row",
  ])
})
