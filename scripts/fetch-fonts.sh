#!/usr/bin/env bash
set -euo pipefail
DEST="src/fonts"; mkdir -p "$DEST"

# Google Fonts serves woff2 only to a UA it believes supports it.
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

fetch() {  # $1 = GF family, $2 = output filename
  local css url
  css=$(curl --fail -sS -A "$UA" "https://fonts.googleapis.com/css2?family=$1:wght@400&display=swap")
  # each @font-face block is preceded by a /* subset */ comment; we want latin
  url=$(printf '%s\n' "$css" | grep -A 8 '/\* latin \*/' | grep -om1 'https://[^)]*\.woff2')
  [ -n "$url" ] || { echo "no latin woff2 found for $1" >&2; exit 1; }
  local tmp expected actual
  tmp=$(mktemp)
  curl --fail -sS -o "$tmp" "$url" || { rm -f "$tmp"; return 1; }
  expected=$(awk -v name="$2" '$2 == name { print $1 }' "$DEST/SHA256SUMS")
  actual=$(sha256sum "$tmp" | cut -d ' ' -f 1)
  if [ -z "$expected" ] || [ "$actual" != "$expected" ]; then
    rm -f "$tmp"
    echo "Font changed: review version, glyphs and licence before updating $2 and SHA256SUMS" >&2
    return 1
  fi
  mv "$tmp" "$DEST/$2"
  printf '%-34s %s bytes\n' "$2" "$(wc -c < "$DEST/$2")"
}

fetch "Lato"                "Lato-Regular.woff2"
fetch "Noto+Serif+Kannada"  "NotoSerifKannada-Regular.woff2"
fetch "EB+Garamond"         "EBGaramond-Regular.woff2"
fetch "Libre+Baskerville"   "LibreBaskerville-Regular.woff2"
