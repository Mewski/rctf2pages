#! /bin/bash

die() {
  [[ -z "$1" ]] || echo "$1"
  exit 1
}

# require_env NAME: fail unless the environment variable $NAME is set
require_env() {
  [[ -z "${!1}" ]] && die "\$$1 not set"
  export "$1"
}

verify_env() {
  require_env PAGES_REPO
  PAGES_REPO="$(realpath "$PAGES_REPO")"

  # The scripts run on either runtime
  if command -v node >/dev/null; then
    JS=node
  elif command -v bun >/dev/null; then
    JS=bun
  else
    die 'Neither node nor bun is installed'
  fi
}

do_stage() {
  verify_env

  set -ex
  shopt -s nullglob
  (cd "$PAGES_REPO" && source "$DIR"/stage.sh)

  git -C "$PAGES_REPO" add -A
  if git -C "$PAGES_REPO" diff --cached --quiet; then
    echo 'Nothing to change'
    return
  fi
  "$@"
}

commit_simple() {
  git -C "$PAGES_REPO" commit -m "$1"
}

commit_command() {
  (
    echo "$1"
    echo
    echo "Command:"
    cat "$DIR"/stage.sh | awk '{ print "  " $0 }'
  ) | git -C "$PAGES_REPO" commit -F -
}
