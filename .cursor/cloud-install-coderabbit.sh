#!/bin/sh
# Idempotent CodeRabbit CLI install for Cursor Cloud (Linux).
# Pin: CodeRabbit CLI v0.7.6. The installer folder and `coderabbit --version`
# are `0.7.6` (no leading v). `CODERABBIT_VERSION=v0.7.6` 404s on
# cli.coderabbit.ai. Skip installer browser login. Authenticate US Team
# only via the CODERABBIT_API_KEY Cursor secret — never commit the key.
# Missing key, failed login, or non-US status fail setup.
set -eu

PINNED_VERSION="0.7.6"
BIN_DIR="${HOME}/.local/bin"
export PATH="${BIN_DIR}:${PATH}"
CI=1
export CI
CODERABBIT_VERSION="${PINNED_VERSION}"
export CODERABBIT_VERSION

if [ -z "${CODERABBIT_API_KEY:-}" ]; then
  echo "cloud-install-coderabbit: CODERABBIT_API_KEY is required (US Agentic key from https://app.coderabbit.ai/settings/api-keys). Store it as a Cursor Cloud secret named CODERABBIT_API_KEY, then re-run: corepack enable && corepack prepare --activate && pnpm install --frozen-lockfile && sh .cursor/cloud-install-coderabbit.sh" >&2
  exit 1
fi

installed_version() {
  if command -v coderabbit >/dev/null 2>&1; then
    coderabbit --version 2>/dev/null | tr -d '[:space:]' | sed 's/^v//'
  else
    printf '%s\n' ""
  fi
}

current="$(installed_version)"
if [ "${current}" != "${PINNED_VERSION}" ]; then
  curl -fsSL https://cli.coderabbit.ai/install.sh | sh
  export PATH="${BIN_DIR}:${PATH}"
  current="$(installed_version)"
fi

if [ "${current}" != "${PINNED_VERSION}" ]; then
  echo "cloud-install-coderabbit: expected CLI ${PINNED_VERSION}, got '${current}'. Reinstall with CODERABBIT_VERSION=${PINNED_VERSION}." >&2
  exit 1
fi

line='export PATH="$HOME/.local/bin:$PATH"'
profile="${HOME}/.profile"
if [ -f "${profile}" ]; then
  grep -Fqx "${line}" "${profile}" || echo "${line}" >>"${profile}"
else
  echo "${line}" >>"${profile}"
fi

coderabbit auth login --region us --api-key "${CODERABBIT_API_KEY}"

status_json="$(coderabbit auth status --agent)"
printf '%s\n' "${status_json}"

printf '%s\n' "${status_json}" | grep -Eq '"authenticated":[[:space:]]*true' || {
  echo "cloud-install-coderabbit: auth status is not authenticated. Recovery: coderabbit auth login --region us --api-key \"\$CODERABBIT_API_KEY\"; coderabbit auth status --agent" >&2
  exit 1
}

printf '%s\n' "${status_json}" | grep -Eq '"region":[[:space:]]*"us"' || {
  echo "cloud-install-coderabbit: auth region is not us. Recovery: coderabbit auth login --region us --api-key \"\$CODERABBIT_API_KEY\"; coderabbit auth status --agent" >&2
  exit 1
}

coderabbit --version
