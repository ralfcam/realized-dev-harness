# Capture Plan (pass fixture)

## Validation Summary

Per item (from the `feedback-validator` subagents):
**[list-omit-bookings] List omit bookings** — verdict: capture

- Evidence: `app/bookings.ts:10`

**[date-arrows-utc] Date arrows UTC** — verdict: capture

- Evidence: `app/calendar.ts:20`

## PHASE 5 Execution Todos

| Todo id | Delegation |
| product-gaps-phase5 | Invoke `docs-updater`: apply 2 writes to `docs/findings/product-gaps.md` (`append [list-omit-bookings]`, `append [date-arrows-utc]`) |
