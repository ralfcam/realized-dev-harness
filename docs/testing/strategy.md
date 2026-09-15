---
type: Test Strategy
title: Test strategy
description: Red Green Refactor layers and fail-closed evidence rules.
tags: [testing, tdd]
status: stable
generated: { by: process:realized-dev-harness-init, at: 2026-09-15T00:00:00Z }
---

# Layers

- Unit/component: Vitest and Testing Library; fast deterministic behavior.
- Integration: Vitest against local Supabase; unavailable infrastructure fails.
- End-to-end: Playwright against the built or development application.
- Harness: Node policy tests for initialization, configuration, and OKF.

# Evidence

Every Green claim includes the exact fresh command, exit result, and executed
test count. Skips and zero-test runs never satisfy acceptance.

Local Supabase evidence additionally requires a migration-and-seed reset,
database lint, loopback Auth and REST health, and a migration fingerprint.
Run the complete verification on a Docker-capable host; scaffold behavior is
covered by the platform-independent harness tests.
