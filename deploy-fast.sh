#!/usr/bin/env bash
set -euo pipefail

# FAST DEPLOY (RSYNC)
# Purpose: sync runtime uploads from TEST -> LIVE
# Rol ayrımı: sadece uploads/ (kod taşımaz)

TEST_HOST="${TEST_HOST:-yunlu@192.168.1.107}"
TEST_APP_DIR="${TEST_APP_DIR:-/home/yunlu/b2b-app}"
LIVE_APP_DIR="${LIVE_APP_DIR:-/home/yunlu/b2b-app}"

SRC_SUBPATH="${1:-uploads/}"

SRC="${TEST_HOST}:${TEST_APP_DIR%/}/${SRC_SUBPATH}"
DST="${LIVE_APP_DIR%/}/${SRC_SUBPATH}"

# Safety checks
if [[ "$SRC_SUBPATH" != uploads/* && "$SRC_SUBPATH" != "uploads" && "$SRC_SUBPATH" != "uploads/" ]]; then
  echo "Refusing to rsync non-uploads path: $SRC_SUBPATH" >&2
  exit 2
fi

mkdir -p "$DST"

RSYNC_FLAGS=(
  -avz
  --partial
  --human-readable
  --progress
)

# Default: no delete to avoid accidental data loss
if [[ "${DEPLOY_DELETE:-0}" == "1" ]]; then
  RSYNC_FLAGS+=(--delete)
fi

# Dry-run support
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  RSYNC_FLAGS+=(--dry-run)
fi

echo "RSYNC FROM: $SRC"
echo "RSYNC TO  : $DST"
rsync "${RSYNC_FLAGS[@]}" "$SRC" "$DST"

echo "Done."
