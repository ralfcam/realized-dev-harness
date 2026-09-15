# sdd-to-tdd

Turn one accepted specification or work item into a Red → Green → Refactor
execution.

1. Read `.cursor/harness.json`, resolve the linked `type: Specification`
   concept, and treat its body acceptance criteria as the only product bar.
2. In Plan Mode, map each criterion to a test layer and an exact command.
3. After approval, execute each criterion separately:
   - Red: add the smallest test and prove it fails for the intended reason.
   - Green: add the smallest implementation and prove the test passes.
   - Refactor: improve structure without changing behavior, then rerun evidence.
4. Integration tests must execute against local Supabase; a skipped suite is a
   failure, never green.
5. Sync affected OKF concepts, provenance, traceability, work-item state, and
   `docs/log.md`.
6. If Linear is enabled, delegate a one-way mirror update to
   `linear-resolver`. Never read Linear back as product truth.
7. Finish by running the configured CodeRabbit advisory only when enabled, then
   hand off to `/review` and `/commit`.
