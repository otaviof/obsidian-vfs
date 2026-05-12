#!/usr/bin/env bash
#
# Compare a local `package.json` version against the published registry version.
# Outputs `publish=true/false` to `${GITHUB_OUTPUT}`` (CI) or prints a summary
# (local).
#

set -euo pipefail

if [[ $# -lt 3 ]]; then
    echo "Usage: check-published.sh <npm|vscode> <package-name> <package.json>" >&2
    exit 1
fi

registry="${1}"
name="${2}"
pkg_json="${3}"

local=$(node --input-type=commonjs -p "require(\"./${pkg_json}\").version")

case "$registry" in
    npm)
        published=$(npm view "${name}" version 2>/dev/null || echo "")
    ;;
    vscode)
        published=$(npx @vscode/vsce show "${name}" 2>/dev/null \
        | sed -n 's/^Version:[[:space:]]*//p' \
        || echo "")
    ;;
    *)
        echo "Unknown registry: $registry" >&2
        exit 1
    ;;
esac

if [[ "${local}" == "${published}" ]]; then
    echo "${name}: ${local} (already published)"
    echo "publish=false" >>"${GITHUB_OUTPUT:-/dev/null}"
else
    echo "${name}: ${local} (new, published: ${published:-none})"
    echo "publish=true" >>"${GITHUB_OUTPUT:-/dev/null}"
fi
