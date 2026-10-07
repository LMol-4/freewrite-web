#!/usr/bin/env bash
# Linux CI only: independent setup tasks, each in its own cancellable group.
set -euo pipefail
browser=${1:?Pass chromium or webkit}
case "$browser" in chromium|webkit) ;; *) exit 2 ;; esac
mkdir -p .local-test/ci-logs
pids=()
cleanup() {
  for pid in "${pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

setsid timeout --kill-after=10s 8m node scripts/local-test.mjs start \
  > .local-test/ci-logs/supabase-start.log 2>&1 &
pids+=("$!")
setsid timeout --kill-after=10s 8m bash -euo pipefail -c '
  echo "Installing Linux browser dependencies"
  pnpm exec playwright install-deps "$1"
  echo "Downloading browser"
  pnpm exec playwright install --only-shell "$1"
' -- "$browser" > .local-test/ci-logs/browser-install.log 2>&1 &
pids+=("$!")

# Stream progress without mixing the persisted task logs.
tail -n +1 -F .local-test/ci-logs/*.log &
tail_pid=$!
trap 'cleanup; kill "$tail_pid" 2>/dev/null || true' EXIT
for pid in "${pids[@]}"; do
  if wait "$pid"; then
    :
  else
    result=$?
    echo "CI setup failed (exit $result); see the separate setup logs." >&2
    exit "$result"
  fi
done
echo "Backend and browser setup completed."
