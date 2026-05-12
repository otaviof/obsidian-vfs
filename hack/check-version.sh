#!/usr/bin/env bash
#
# Verify that one or more `package.json`` files share the same version.  With a
# single path, prints the version. With multiple, checks they match.
#

set -euo pipefail

if [[ $# -eq 0 ]]; then
    echo "Usage: check-version.sh <package.json> [<package.json> ...]" >&2
    exit 1
fi

version=""
for pkg in "${@}"; do
    v=$(node --input-type=commonjs -p "require(\"./${pkg}\").version")
    if [[ -z "${version}" ]]; then
        version="${v}"
    elif [[ "${v}" != "${version}" ]]; then
        echo "version mismatch: ${pkg} (${v}) != ${1} (${version})" >&2
        exit 1
    fi
    echo "${pkg}: ${v}"
done

echo "OK: ${version}"
