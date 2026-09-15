# CodeRabbit profile

Enable with `/init --with-coderabbit`. Initialization installs the repository
configuration and latest-head promotion workflow.

Install the CodeRabbit CLI from its official distribution, authenticate
interactively outside repository scripts, then verify with:

```sh
coderabbit --version
coderabbit auth status --agent
```

Never commit an API key. Local review is advisory during TDD; the generated
promotion workflow requires a CodeRabbit review on the latest pull-request
head.

In the CodeRabbit web IDE, enable review from the current task's actions and
rerun `coderabbit review --agent -t uncommitted`. Authentication there is
runtime-managed: never run `coderabbit auth login`, inject an API key, or use
another identity as a fallback. If task actions still report review as disabled
or unauthenticated, record it as an external task/runtime blocker.
