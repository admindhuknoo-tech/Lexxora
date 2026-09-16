#!/usr/bin/env bash
# Freezes V6.12.2 as the baseline and creates the two parallel V7 tracks.
# Safe to re-run: skips any step already done.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! git rev-parse -q --verify "refs/tags/v6.12.2-baseline" >/dev/null; then
  git add -A
  git commit -m "Freeze V6.12.2 baseline before V7 desktop/web split" --allow-empty
  git tag -a v6.12.2-baseline -m "Frozen core baseline before V7 split"
  echo "Tagged v6.12.2-baseline"
else
  echo "Tag v6.12.2-baseline already exists, skipping"
fi

for branch in track/desktop track/web; do
  if ! git rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
    git checkout -b "$branch" v6.12.2-baseline
    git checkout main
    echo "Created branch $branch from v6.12.2-baseline"
  else
    echo "Branch $branch already exists, skipping"
  fi
done

echo ""
echo "Done. Branches:"
git branch -vv
