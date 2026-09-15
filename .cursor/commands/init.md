# init

Bootstrap this harness checkout into a Next.js + Supabase application.

1. Read `.cursor/harness.json`. Refuse if `initialized` is already true.
2. Resolve the project name from the argument or ask for one.
3. Ask whether to enable the recommended CodeRabbit and Linear profiles.
   Linear also requires a team key and may receive a project identifier.
4. Run:

```sh
node .cursor/bootstrap/init.mjs --project-name "<name>" [--with-coderabbit] [--with-linear --linear-team-key "<key>" --linear-project "<id-or-slug>"]
```

Do not add `--skip-supabase-start` unless the operator explicitly requests a
scaffold-only recovery. That recovery remains unverified until Docker is
available and `/verify-local` succeeds. Report each completed phase and leave
changes uncommitted.

The initializer uses only versions pinned in `.cursor/bootstrap/manifest.json`
and resumes `scaffolded`, `merged`, `installed`, `configured`, `verified`, and
`complete` phases. There is no public dependency-install bypass.
