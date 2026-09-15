# upgrade-harness

Plan an upgrade against the harness files bundled in the current checkout:

```sh
pnpm harness:upgrade -- --dry-run
```

Review every reported file and collision. Apply only when the dry run is clean:

```sh
pnpm harness:upgrade -- --apply
pnpm install
pnpm test:harness
pnpm harness:lint
```

The upgrader changes only the harness configuration and required package
interfaces. It refuses customized script collisions and automatically restores
both manifests if an apply step fails. It never changes application code,
credentials, remote resources, or Git history.
