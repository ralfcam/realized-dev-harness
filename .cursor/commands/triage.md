# triage

Convert open findings into canonical local work.

Read `docs/findings/` and `docs/work-items/`. Consolidate duplicates, then
create or update one `type: Work Item` concept per accepted unit of work with:
`workflow_state: backlog`, `priority: critical|high|medium|low`, source links,
and an owning specification when known. Linear, when enabled, receives only a
mirror after local files are valid.

Create new canonical work with:

```sh
pnpm work-item -- create --id "<slug>" --title "<title>" --priority "<priority>" --spec "/specs/<spec>.md"
```

Change only validated workflow fields with:

```sh
pnpm work-item -- triage --id "<slug>" --state ready --priority high
```
