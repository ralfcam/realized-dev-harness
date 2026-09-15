---
type: Decision
title: Versioned bootstrap and compatibility
description: Pins bootstrap inputs and defines safe harness upgrade boundaries.
tags: [bootstrap, compatibility, upgrade]
status: stable
generated: { by: process:realized-dev-harness-maintenance, at: 2026-09-15T00:00:00Z }
---

# Decision

Bootstrap inputs are pinned in the tracked manifest. Generated projects record
the harness version, template provenance, and runtime contract. Executable
`@latest` selectors are forbidden.

Patch and minor harness releases preserve configuration schema version 1.
Breaking configuration changes require a new schema version and an explicit
ordered migration. `/upgrade-harness` is dry-run by default, refuses customized
script collisions, and restores managed manifests if apply fails.

# Maintenance

Version updates require source harness tests, a cross-platform scaffold matrix,
and a full Docker-backed bootstrap result before the manifest changes.
