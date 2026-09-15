---
type: Architecture Decision
title: Documentation is the source of truth
description: Keep product acceptance and work state in portable OKF concepts.
tags: [decision, okf, sdd]
status: stable
decision_status: accepted
generated: { by: process:realized-dev-harness-init, at: 2026-09-15T00:00:00Z }
sources:
  - id: okf
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.2
---

# Decision

Project knowledge is stored under `docs/` as OKF v0.2 concepts.
Specifications own acceptance criteria and work-item concepts own the queue.
Linear and CodeRabbit may mirror or review this state but cannot replace it.

# Consequences

Changes to behavior require synchronized specification, implementation, tests,
and provenance. Operational integrations can be removed without losing the
project's intent or work history.
