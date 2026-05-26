#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.content-growth"
MODE="${1:-ci}"

cd "$ROOT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env.content-growth"
  echo "Create it with: cp .env.content-growth.example .env.content-growth"
  echo "Then fill your API keys."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if ! command -v pi >/dev/null 2>&1; then
  echo "pi is not installed. Install with:"
  echo "npm install -g --ignore-scripts @earendil-works/pi-coding-agent"
  exit 1
fi

if [ ! -f ".pi/extensions/content-growth/index.ts" ]; then
  echo "Missing pi content-growth extension at .pi/extensions/content-growth/index.ts"
  exit 1
fi

case "$MODE" in
  ci)
    COMMAND="/content-growth-ci"
    ;;
  daily|weekly|monthly|audit)
    COMMAND="/content-growth-run $MODE"
    ;;
  status)
    COMMAND="/content-growth-status"
    ;;
  *)
    echo "Usage: scripts/content-growth-local.sh [ci|daily|weekly|monthly|audit|status]"
    exit 1
    ;;
esac

echo "Running: pi -p \"$COMMAND\""
echo

pi -p "$COMMAND"

echo
if ! git diff --quiet; then
  echo "Content growth produced local changes:"
  git status --short
  echo
  echo "Review changes with: git diff"
else
  echo "No local changes produced."
fi
