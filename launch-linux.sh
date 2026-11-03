#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "$0")"
if [[ -x release/0.6.2/linux-unpacked/surface-projection ]]; then
  exec ./release/0.6.2/linux-unpacked/surface-projection "$@"
elif [[ -x node_modules/.bin/electron ]]; then
  exec ./node_modules/.bin/electron . "$@"
else
  echo 'Install Node.js 22+, run npm install in this folder, then try again.' >&2
  exit 1
fi
