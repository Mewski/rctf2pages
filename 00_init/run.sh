#! /bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$DIR"/../lib.sh

require_env PAGES_REPO
mkdir -p "$PAGES_REPO"
verify_env

set -ex
git -C "$PAGES_REPO" init
git -C "$PAGES_REPO" branch -M main
