#!/bin/sh
# Portable launcher for the structured current-skill contract validator.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

PYTHON=
for candidate in python3 python py; do
  if "$candidate" -c "" >/dev/null 2>&1; then
    PYTHON=$candidate
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "Error: Python 3 is required (tried python3, python, and py)" >&2
  exit 127
fi

exec "$PYTHON" "$SCRIPT_DIR/check-current-skill-contracts.py" "$@"
