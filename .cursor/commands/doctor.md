# doctor

Diagnose bootstrap and verification readiness without changing repository or
external state.

Run:

```sh
pnpm harness:doctor
```

Use `pnpm harness:doctor -- --json` for machine-readable output. Report every
`FAIL` with its recovery action. CodeRabbit task enablement is an external IDE
control: never attempt authentication or alternate credentials from this
command.

