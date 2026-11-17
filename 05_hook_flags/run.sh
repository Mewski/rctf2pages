#! /bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$DIR"/../lib.sh

if [[ -z "$ADMIN_CHALLS" || ! -f "$ADMIN_CHALLS" ]]; then
  echo 'Error: $ADMIN_CHALLS not set, or not a file'
  echo 'This stage requires chal flags so that hashes of the flags may be added to client side JS so that the flag checking may be done on the client side.'
  echo 'Set $ADMIN_CHALLS to a file with the challenges as the admin API lists them. With the token of an admin:'
  echo '  curl -H "Authorization: Bearer $TOKEN" "$RCTF_URL"/api/v2/admin/challs > admin-challs.json'
  die
fi

export ADMIN_CHALLS
ADMIN_CHALLS="$(realpath "$ADMIN_CHALLS")"

do_stage commit_simple 'Add JS hooks to challenge page for flag verify'
