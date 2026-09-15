import assert from "node:assert/strict"
import { test } from "node:test"
import { classifyDoctor } from "../bootstrap/doctor.mjs"

function facts(overrides = {}) {
  return {
    initialized: false,
    nodeMajor: 24,
    pnpmOk: true,
    pnpmVersion: "10.34.5",
    npxOk: true,
    gitClean: true,
    dockerAvailable: true,
    dockerDaemon: true,
    localSupabaseVerified: true,
    coderabbitEnabled: false,
    coderabbitAvailable: true,
    coderabbitAuthenticated: false,
    ...overrides,
  }
}

function byId(checks, id) {
  return checks.find((check) => check.id === id)
}

test("doctor reports a ready scaffold environment without requiring CodeRabbit", () => {
  const checks = classifyDoctor(facts())
  assert.equal(checks.some((check) => check.status === "fail"), false)
  assert.equal(byId(checks, "coderabbit").status, "warn")
})

test("doctor separates a missing Docker binary from an unreachable daemon", () => {
  const missing = classifyDoctor(
    facts({
      dockerAvailable: false,
      dockerDaemon: false,
      localSupabaseVerified: false,
    }),
  )
  assert.equal(byId(missing, "docker-binary").status, "fail")
  assert.equal(byId(missing, "docker-daemon").status, "fail")

  const stopped = classifyDoctor(
    facts({
      dockerAvailable: true,
      dockerDaemon: false,
      localSupabaseVerified: true,
    }),
  )
  assert.equal(byId(stopped, "docker-binary").status, "pass")
  assert.equal(byId(stopped, "docker-daemon").status, "warn")
})

test("pending verification fails closed with a recovery command", () => {
  const checks = classifyDoctor(
    facts({ initialized: true, localSupabaseVerified: false }),
  )
  const check = byId(checks, "supabase-verification")
  assert.equal(check.status, "fail")
  assert.match(check.remediation, /verify-local/)
})

test("scaffold-only initialization remains recoverable without Docker", () => {
  const checks = classifyDoctor(
    facts({
      initialized: true,
      dockerAvailable: true,
      dockerDaemon: false,
      localSupabaseVerified: false,
    }),
  )
  assert.equal(byId(checks, "docker-daemon").status, "fail")
  assert.match(byId(checks, "docker-daemon").remediation, /bootstrap-smoke CI/)
  assert.match(byId(checks, "supabase-verification").remediation, /verify-local/)
})

test("enabled CodeRabbit requires both CLI availability and authentication", () => {
  const missing = classifyDoctor(
    facts({ coderabbitEnabled: true, coderabbitAvailable: false }),
  )
  assert.equal(byId(missing, "coderabbit").status, "fail")
  const unauthenticated = classifyDoctor(
    facts({
      coderabbitEnabled: true,
      coderabbitAvailable: true,
      coderabbitAuthenticated: false,
    }),
  )
  assert.equal(byId(unauthenticated, "coderabbit").status, "fail")
  assert.match(byId(unauthenticated, "coderabbit").remediation, /task actions/)
  const ready = classifyDoctor(
    facts({
      coderabbitEnabled: true,
      coderabbitAvailable: true,
      coderabbitAuthenticated: true,
    }),
  )
  assert.equal(byId(ready, "coderabbit").status, "pass")
})
