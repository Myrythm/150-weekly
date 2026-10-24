#!/usr/bin/env bash
# Rebuilds .claude/preview/index.html: weekly-150.html wrapped in the same
# doctype skeleton the Artifact host adds, so a local server renders it like
# the published page. Also syntax-checks the inline script and counts dashes.
# Run from the project root: bash tools/build-preview.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .claude/preview
{
  printf '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  printf '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%%}[hidden]{display:none!important}</style>\n'
  printf '</head><body>\n'
  cat weekly-150.html
  printf '\n</body></html>\n'
} > .claude/preview/index.html
cp "20261006Outdoor running_01 (1).gpx" .claude/preview/real.gpx 2>/dev/null || true
cp tools/gpx/fixtures/*.gpx tools/gpx/fixtures/*.xml .claude/preview/ 2>/dev/null || true

node -e "
const fs=require('fs'),os=require('os'),path=require('path');
const s=fs.readFileSync('weekly-150.html','utf8');
const js=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const out=path.join(os.tmpdir(),'w150-inline.js');fs.writeFileSync(out,js);console.log(out);
" > /tmp/w150-path.txt
node --check "$(cat /tmp/w150-path.txt)" && echo "inline script: syntax OK"
echo "em/en dashes in page: $(grep -c $'\xe2\x80\x94\|\xe2\x80\x93' weekly-150.html || true)"
echo "preview ready: start the 'weekly150-preview' server from .claude/launch.json (http://localhost:8150)"
