#!/usr/bin/env bash
#
# Publish the VSCode extension to the marketplace. If the version already exists,
# exit 0 instead of failing the CI run.
#

set -euo pipefail

(
    cd packages/vscode

    if output=$(pnpm exec vsce publish --packagePath obsidian-vfs.vsix 2>&1); then
        exit 0
    fi

    if [[ "${output}" == *"already exists"* ]]; then
        echo "Version already published, skipping." >&2
        exit 0
    fi

    echo "${output}" >&2
    exit 1
)
