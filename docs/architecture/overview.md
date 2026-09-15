---
type: Architecture
title: System overview
description: Initial application boundaries and source-of-truth data flow.
tags: [architecture, nextjs, supabase]
status: draft
generated: { by: process:realized-dev-harness-init, at: 2026-09-15T00:00:00Z }
sources:
  - id: next-example
    resource: https://github.com/vercel/next.js/tree/canary/examples/with-supabase
    title: Next.js with Supabase example
---

# Boundaries

- Next.js owns rendering, route handlers, and server actions.
- Supabase owns PostgreSQL data, authentication, storage, and row-level policy.
- Browser code uses publishable credentials only.
- Privileged credentials remain server-only and are never committed.

# Change rule

Update this concept when a specification introduces a new boundary, external
service, trust zone, or data owner.
