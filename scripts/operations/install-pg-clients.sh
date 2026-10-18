#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$RUNNER_TEMP/lms-pg-bin"
for tool in pg_dump pg_restore psql; do
  printf '#!/bin/sh\nexec node "%s/scripts/operations/pg-container-client.mjs" %s "$@"\n' "$GITHUB_WORKSPACE" "$tool" > "$RUNNER_TEMP/lms-pg-bin/$tool"
  chmod 700 "$RUNNER_TEMP/lms-pg-bin/$tool"
done
echo "$RUNNER_TEMP/lms-pg-bin" >> "$GITHUB_PATH"
