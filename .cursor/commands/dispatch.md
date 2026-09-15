# dispatch

Groom and activate the local work queue.

Read dispatch limits from `.cursor/harness.json`. Rank backlog work by
priority, dependency readiness, and specification completeness. Move only
enough ready items to `workflow_state: ready` to reach the configured active
range; never exceed `maximumActive`. Update local concepts first, then mirror
to Linear when enabled. Report blocked and deferred work explicitly.

After grooming items into `ready`, preview deterministic selection with
`pnpm work-item -- dispatch --dry-run`. Run `pnpm work-item -- dispatch` to
activate the selected items as `in_progress`, then validate with
`pnpm harness:lint` before any optional Linear mirror.
