#! /bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$DIR"/../lib.sh

verify_env
require_env GITHUB_REMOTE

set -ex
git -C "$PAGES_REPO" remote get-url origin >/dev/null 2>&1 ||
  git -C "$PAGES_REPO" remote add origin "$GITHUB_REMOTE"
git -C "$PAGES_REPO" push -u origin main
