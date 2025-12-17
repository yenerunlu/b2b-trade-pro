#!/usr/bin/env bash
set -euo pipefail

# SAFE DEPLOY (GIT)
# Purpose: deploy code/config tracked by git
# Rol ayrımı: uploads/ git dışı kalır, rsync ile taşınır.

APP_DIR="${APP_DIR:-/home/yunlu/b2b-app}"
PM2_PROCESS="${PM2_PROCESS:-b2b-trade-pro}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "Fetching latest..."
git fetch --all --prune

echo "Checking out $BRANCH..."
git checkout "$BRANCH"

echo "Pulling..."
git pull --ff-only origin "$BRANCH"

echo "Restarting PM2 process: $PM2_PROCESS"
pm2 restart "$PM2_PROCESS"

echo "Done. Smoke test: https://b2b.irazoto.com"
