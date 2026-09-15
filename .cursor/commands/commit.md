# commit

Create a narrow verified commit.

Read commands from `.cursor/harness.json`; run lint, typecheck, unit,
integration when affected, E2E when affected, build, and harness checks.
Skipped tests and stale evidence fail. Stage explicit paths only, never
`git add .` or `git add -A`. Show the staged diff, commit once, and do not
push or write remote workflow state.
