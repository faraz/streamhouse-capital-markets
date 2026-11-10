#!/usr/bin/env bash
# Screenshot a page in Aside's browser, in one call. Looking at the render found more bugs
# than the test suite did, so it should be the cheapest check to run, not the dearest.
#
#   scripts/shoot.sh                                   the local Worker, into artifacts/desk.png
#   scripts/shoot.sh http://127.0.0.1:8787/ out.png    any page, any file
#   WAIT_MS=40000 scripts/shoot.sh                     wait longer (an agent answer takes ~40s)
#
# Aside's repl cannot write outside its own session folder, so the image comes back as
# base64 on stdout and is decoded here. Also writes a copy no wider than 1600px beside it,
# small enough to read back.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="${1:-http://127.0.0.1:8787/}"
OUT="${2:-artifacts/desk.png}"
WAIT_MS="${WAIT_MS:-9000}"
WIDTH="${WIDTH:-1600}"
HEIGHT="${HEIGHT:-1000}"
mkdir -p "$(dirname "$OUT")"
RAW=$(mktemp)
trap 'rm -f "$RAW"' EXIT

# A block, so its consts do not collide with an earlier call: the repl keeps its scope.
aside repl "
{
  const tab = await openTab('$URL');
  await tab.setViewportSize({ width: $WIDTH, height: $HEIGHT });
  await sleep($WAIT_MS);
  await tab.evaluate(() => window.scrollTo(0, 0));
  const png = await tab.screenshot({ fullPage: false });
  console.log('B64START'); console.log(png.toString('base64')); console.log('B64END');
  await tab.close().catch(() => {});
}
" > "$RAW" 2>/dev/null

awk '/B64START/{f=1;next}/B64END/{f=0}f' "$RAW" | tr -d '\n ' | base64 -d > "$OUT"
if ! file "$OUT" | grep -q 'PNG image'; then
  echo "no screenshot came back from $URL; aside said:" >&2
  head -5 "$RAW" >&2
  exit 1
fi
VIEW="${OUT%.png}-view.png"
sips -Z 1600 "$OUT" --out "$VIEW" >/dev/null
echo "$VIEW"
