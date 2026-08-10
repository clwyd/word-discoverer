#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifest="$repo_root/words_discoverer_chrome/manifest.json"
version="$(grep '"version":' "$manifest" | head -n1 | cut -d '"' -f 4)"
dist_dir="$repo_root/dist"
archive="$dist_dir/word-discoverer-$version.zip"

if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
    printf 'Working tree is not clean. Commit or stash changes before packaging.\n' >&2
    git -C "$repo_root" status --short >&2
    exit 1
fi

mkdir -p "$dist_dir"
tmp_archive="$(mktemp "$dist_dir/.word-discoverer-$version.XXXXXX.zip")"
git -C "$repo_root" archive \
    --format=zip \
    --prefix=word-discoverer/ \
    -o "$tmp_archive" \
    HEAD:words_discoverer_chrome
mv "$tmp_archive" "$archive"
printf 'Created: %s\n' "$archive"
