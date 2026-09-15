# push

Push a verified branch without merging.

Require a clean tree and fresh configured checks. Feature branches use the
configured prefix and target the configured accumulator branch. Pushing the
accumulator prepares a promotion to the configured default branch. Never run
`gh pr merge`; report the pull-request URL for the operator.
