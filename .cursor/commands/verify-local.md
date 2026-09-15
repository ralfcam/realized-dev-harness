# verify-local

Complete a scaffold-only initialization after Docker becomes available.

1. Run `pnpm harness:doctor` and require a reachable Docker daemon.
2. Run:

```sh
pnpm verify:local
```

This starts local Supabase, writes an owner-only `.env.local`, and runs
integration, lint, typecheck, unit, harness, build, and E2E checks. It records
`localSupabaseVerifiedAt` only after every check succeeds. Never substitute a
remote database or a partial emulator.

