# reset-local-db

Reset only the local Supabase database.

Verify `supabase status` resolves to loopback hosts and refuse any linked or
remote project. After explicit confirmation run `pnpm exec supabase db reset
--local`, then execute the configured integration tests. Never run a remote
reset command.
