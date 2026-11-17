#! /bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$DIR"/../lib.sh

require_env RCTF_URL

do_stage commit_simple 'Initial commit: Add scraped site'
