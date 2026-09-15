# audit

Perform a read-only specification and test audit.

1. Discover concepts from `docs/index.md`; audit only non-deprecated
   `type: Specification` files.
2. For every acceptance criterion, cite current code and freshly executed test
   evidence or report `cannot verify`.
3. Check security, error handling, observability, architecture, and whether
   integration suites executed rather than skipped.
4. Write each confirmed gap as an OKF `Finding` concept and link it from
   `docs/findings/index.md`. Do not change implementation.
