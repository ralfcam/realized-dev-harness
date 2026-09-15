# capture

Capture an observation as an OKF finding.

Validate the observation against the current tree. If confirmed, create
`docs/findings/<slug>.md` with `type: Finding`, severity, evidence,
provenance, and `finding_status: open`. Link it from the findings index and
append `docs/log.md`. Never create a Linear-only finding.
