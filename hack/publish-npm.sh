#!/usr/bin/env bash
#
# Publish an npm package using OIDC trusted publishing. Runs `pnpm pack` (resolves
# `workspace:` protocols) then `npm publish` with provenance.
#

set -euo pipefail

if [[ ${#} -lt 1 ]]; then
    echo "Usage: publish-npm.sh <package-dir>" >&2
    exit 1
fi

pkg_dir="${1}"

# The pnpm pack resolves "workspace:" protocols to real semver ranges.
tarball=$(cd "${pkg_dir}" && pnpm pack 2>/dev/null | tail -1)

trap 'rm -f "${pkg_dir}/${tarball}"' EXIT

exec npm publish "${pkg_dir}/${tarball}" --access public --provenance
