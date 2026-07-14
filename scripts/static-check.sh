#!/bin/bash
# Cross-platform launcher for the structured skill Markdown checker.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not in a git repository" >&2
  exit 1
fi

PYBIN=""
for candidate in python3 python py; do
  if "$candidate" -c "" >/dev/null 2>&1; then
    PYBIN="$candidate"
    break
  fi
done
if [ -z "$PYBIN" ]; then
  echo "Error: Python 3 is required for scripts/static-check.py" >&2
  exit 1
fi

exec "$PYBIN" "$REPO_ROOT/scripts/static-check.py" --root "$REPO_ROOT"
