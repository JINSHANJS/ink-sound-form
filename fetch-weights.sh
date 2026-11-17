#!/bin/sh
set -eu
dest="${1:-weights}"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
url='https://github.com/JINSHANJS/ink-sound-form/releases/download/model-v1/callirewrite-phase2.tar.gz'
curl --fail --location --retry 3 --output "$tmp" "$url"
printf '%s  %s\n' 'cfb6d59f831381bbfac20d44c6b56aabce4b453dab13d7070f726e40842dc87b' "$tmp" | sha256sum --check
mkdir -p "$dest"
tar -xzf "$tmp" -C "$dest"
