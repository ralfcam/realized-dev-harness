# intake

Verify a Cursor Cloud pull request without merging it.

Resolve the PR and freeze its head SHA. Require a `cursor/` head, verify its
ancestry against the configured accumulator branch, run configured checks in an
isolated worktree, and report whether it is safe for operator review. Never
retarget an unrelated branch or merge the PR.
