---
type: Template
title: Work-item template
description: Template for canonical local planning and dispatch state.
tags: [work-item, template]
status: stable
generated: { by: process:realized-dev-harness-init, at: 2026-09-15T00:00:00Z }
---

# Outcome

State one independently verifiable outcome.

# Metadata

Copy this template and add:

```yaml
type: Work Item
workflow_state: backlog
priority: medium
spec: /specs/example.md
```

Allowed workflow states are `triage`, `backlog`, `ready`, `in_progress`,
`in_review`, `done`, and `canceled`. Optional external IDs live beneath
an `external` extension; local content remains authoritative.
