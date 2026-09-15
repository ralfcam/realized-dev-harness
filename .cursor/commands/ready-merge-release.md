# ready-merge-release

Evaluate one pull request for manual merge.

Freeze the head SHA, require all configured checks, confirm specs and OKF docs
are synchronized, and inspect unresolved review threads. When CodeRabbit is
enabled, require its latest-head review; when disabled, report that fact rather
than failing. Mark a clean draft ready if authorized, then stop for the human
merge.
