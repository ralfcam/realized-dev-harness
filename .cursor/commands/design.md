# design

Create or refine one specification before implementation.

1. Read `.cursor/harness.json`, `docs/index.md`, and the indexes beneath
   `docs/product/`, `docs/architecture/`, `docs/decisions/`, and
   `docs/specs/`.
2. Resolve conflicts by asking one decision at a time.
3. Write one OKF concept at `docs/specs/<slug>.md` with `type:
   Specification`, `status: draft|stable|deprecated`, `spec_status:
   proposed|accepted|implemented`, explicit acceptance criteria, constraints,
   and links to affected concepts.
4. Add it to `docs/specs/index.md` and record the change in `docs/log.md`.
5. Do not write implementation code or tests.
