#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TS="$(date +"%Y%m%d-%H%M%S")"
OUT_FILE="$BACKUP_DIR/backup-$TS.tar.gz"

mkdir -p "$BACKUP_DIR"

tar -czf "$OUT_FILE" \
  -C "$ROOT_DIR" \
  package.json \
  package-lock.json \
  server.js \
  controllers \
  routes \
  middlewares \
  services \
  jobs \
  config \
  public \
  2>/dev/null || tar -czf "$OUT_FILE" -C "$ROOT_DIR" package.json server.js controllers routes middlewares services jobs config public

# Retention: keep last 5 backups
mapfile -t files < <(ls -1t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null || true)
if [ "${#files[@]}" -gt 5 ]; then
  for f in "${files[@]:5}"; do
    rm -f "$f"
  done
fi

echo "Backup created: $OUT_FILE"
