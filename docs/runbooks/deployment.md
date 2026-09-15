---
type: Runbook
title: Deployment
description: Provider-neutral release and rollback checklist.
tags: [runbook, deployment]
status: draft
generated: { by: process:realized-dev-harness-init, at: 2026-09-15T00:00:00Z }
---

# Preconditions

- The accumulator-to-default pull request is frozen at a reviewed head SHA.
- Specifications, tests, migrations, and OKF documentation agree.
- Required environment variables are configured without exposing values.

# Release

Use the chosen hosting provider's documented Git integration. Record the
provider, project identity, health check, and rollback procedure here before
the first production release. No Vercel account or project is assumed.
