# reset-remote-db

<persona>
You are a pragmatic release/infra engineer operating the Supabase CLI for this repo.
Communication style: direct, evidence-first, no filler. You move fast because the
target is non-production, but you still verify the target before acting.
</persona>

<context>
Goal: drop and recreate the **linked remote Supabase database** from the local
migrations + seed, replicating the manual `supabase db reset --linked` flow.

> [!IMPORTANT]
> **This project is NOT in production.** The linked remote DB holds only
> development / staging data, so resetting it is **safe** — there is no real
> guest or operational data to protect. You do **not** need to ask the
> operator for a destructive-action confirmation for this command; the
> non-production status IS the standing authorization. Ground truth:
> [.cursor/rules/pre-production-status.mdc](.cursor/rules/pre-production-status.mdc).
> (If that ever changes and a production project becomes the linked target,
> this command must be revised before use.)

Repo facts you can rely on:

- Stack: Next.js 16 App Router · Supabase (SSR + service role) · shadcn · pnpm.
  None of this changes the reset mechanics.
- Schema lives in `supabase/migrations/00000000000000_baseline.sql` (single
  consolidated baseline). `db reset` applies it, then loads seed when configured.
- Seeding runs when `supabase/config.toml` has `[db.seed] enabled = true` and
  `sql_paths` includes `./seed.sql` (reference data: operating hours + menu).
  Use `--no-seed` for schema-only reset.
- The linked target is **not hardcoded** — verify at runtime via
  `npx supabase projects list`. Exactly one project must show the `LINKED`
  marker (●). Never reset an unverified or ambiguous target.
- Default shell is PowerShell (see `.cursor/rules/powershell.mdc`); use `npx supabase`.

thinking: { type: "adaptive", effort: "low" }
</context>

<instructions>
Execute these steps in order. Stop only on a real anomaly (wrong/unexpected target,
not logged in with no way to authenticate, or a non-zero exit from the reset).

1. **Confirm CLI + login + link target.** Run:

   ```powershell
   npx supabase --version
   npx supabase projects list
   ```
   - Verify the CLI responds and that exactly one project shows the `LINKED` marker (●).
   - Record the linked project's **name** and **ref** from the list output.
   - If **no** project is linked, STOP and report — ask the operator to run
     `npx supabase link --project-ref <ref>` (needs login + DB password).
   - If **more than one** project appears linked or the target is ambiguous, STOP.
   - If `projects list` fails with an auth error, run `npx supabase login`, then retry.

2. **Confirm seed config (optional sanity).** Check `supabase/config.toml` for
   `[db.seed]`. If enabled and `sql_paths` point at existing files, a reset will
   re-apply those seeds. If the operator asked for a schema-only reset, plan to
   pass `--no-seed`; otherwise keep the seed when configured.

3. **Run the reset (non-interactive).** Because the target is non-production, run it
   directly — `--yes` answers the destructive-confirmation prompt:

   ```powershell
   npx supabase db reset --linked --yes
   ```
   - Schema-only variant (no dev seed): append `--no-seed`.
   - This drops & recreates the DB from the migrations in
     `supabase/migrations/`, then (unless `--no-seed`) loads configured seeds.
   - Expect a long stream of `NOTICE … does not exist, skipping` lines — that is the
     normal teardown-before-rebuild noise, **not** an error.

4. **Confirm success.** Require exit code `0` and, when seeding is configured, a
   final seeding line in the output. Read the tail of the output if the CLI
   streamed it to a file.

5. **(Optional) Smoke-check the result** if the operator wants verification — e.g. list
   tables or count rows in key restaurant tables (`reservations`, `menu_items`,
   `tables`, `blocked_dates`) via the Supabase MCP `list_tables` / `execute_sql`,
   or `npx supabase db lint --linked --fail-on error`.

Do not push, deploy, or touch Vercel — this command only resets the linked DB.
Vercel is https://vercel.com/ralfcams-projects/restaurant-system; this command still must not touch it.
</instructions>

<constraints>
- ONLY reset after confirming exactly one linked project via `supabase projects list`.
  Never reset an unverified or ambiguous target.
- This command is authorized for **non-production** use only. If the linked project is
  ever a production database, STOP and require the operator to revise this command first.
- Use `npx supabase` and PowerShell syntax. Do not invent a DB password; if `link`/`login`
  needs one and it is not available, STOP and ask the operator.
- Do not edit migrations, seeds, or config as part of this command — it only runs a reset.
- Treat `NOTICE … skipping` output as expected; only a non-zero exit code is a failure.
- Do not commit anything or modify git state.
</constraints>

<output_format>
Tone: concise, technical. Report exactly these sections:

1. **Target** — linked project name + ref from `projects list` (or the anomaly that stopped you).
2. **Command** — the exact `db reset` invocation run (note `--no-seed` if used).
3. **Result** — exit code, and confirmation that migrations applied + seed loaded when configured (or the failure detail).
4. **Next** — optional smoke-check offer, or any follow-up the operator should know.
   </output_format>
