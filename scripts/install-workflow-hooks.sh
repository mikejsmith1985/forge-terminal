#!/usr/bin/env bash
# install-workflow-hooks.sh — put the Forge workflow gate into the pre-commit hook git runs.
#
# Mirror of scripts/install-workflow-hooks.ps1 for macOS / Linux users.
#
# This script no longer carries its own copy of the hook. It delegates to
# `forge workflow hooks`, which asks git where hooks live (core.hooksPath),
# merges the gate into Forge's own scaffold hook when one is present, and
# refuses to touch a hook written by another tool. Three hand-maintained
# copies of the hook body are how the gate drifted out of every scaffolded
# repository; one source of truth is the fix.
set -e

repo="${1:-$(pwd)}"
if [ ! -e "$repo/.git" ]; then
  echo "Not a git repository: $repo" >&2
  exit 1
fi

# Locate Forge Terminal. FORGE_BIN is exported into every Forge tab; a bare
# "forge" on PATH is deliberately not tried, because an unrelated package
# answers to that name.
forge_bin=""
if [ -n "${FORGE_BIN:-}" ] && [ -x "$FORGE_BIN" ]; then forge_bin="$FORGE_BIN"
elif [ -x "$repo/forge" ]; then forge_bin="$repo/forge"
elif [ -x "$repo/fterm.exe" ]; then forge_bin="$repo/fterm.exe"
elif [ -x "$repo/forge.exe" ]; then forge_bin="$repo/forge.exe"
elif command -v fterm >/dev/null 2>&1; then forge_bin="fterm"
fi

if [ -z "$forge_bin" ]; then
  echo "Forge Terminal not found. Run this from a Forge Terminal tab (FORGE_BIN is set there)," >&2
  echo "or put fterm on PATH. The hook needs the same binary at commit time, so an install" >&2
  echo "without it would enforce nothing." >&2
  exit 1
fi

cd "$repo"
"$forge_bin" workflow hooks
