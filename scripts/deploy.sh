#!/usr/bin/env bash
# Build the screen and deploy it with its server routes, then set every secret.
#
# Requires `npx wrangler login` once, which opens a browser.
#
# Nothing here is a security boundary except the reader credential's scope: the gate
# value ends up in the client bundle, so it stops drive-by traffic and nothing more. The
# control that matters is that the key the Worker holds can only READ two topics.
set -euo pipefail
cd "$(dirname "$0")/.."
PATH="/opt/homebrew/bin:$PATH"
set -a; . ./.env; set +a

if ! npx wrangler whoami 2>&1 | grep -qi 'account'; then
  echo "not authenticated. run: npx wrangler login" >&2
  exit 1
fi

: "${DEMO_GATE_PROD:?set DEMO_GATE_PROD in .env first (scripts/deploy.sh generates one if missing)}"

echo "== build"
VITE_DEMO_GATE="$DEMO_GATE_PROD" npx vite build

echo "== deploy"
npx wrangler deploy

echo "== secrets"
# Every one of these stays server-side. None is in the bundle.
for k in CONFLUENT_SQL_ENDPOINT CONFLUENT_GLOBAL_KEY CONFLUENT_GLOBAL_SECRET \
         DEMO_ENVIRONMENT_ID DEMO_CLUSTER_ID RTCE_MCP_URL ANTHROPIC_API_KEY \
         CONFLUENT_REST_ENDPOINT CONFLUENT_KAFKA_KEY CONFLUENT_KAFKA_SECRET \
         RAW_EVENTS_SCHEMA_ID; do
  v=$(eval "printf '%s' \"\${$k:-}\"")
  if [ -z "$v" ]; then echo "  skip $k (not in .env)"; continue; fi
  printf '%s' "$v" | npx wrangler secret put "$k" >/dev/null 2>&1 && echo "  set $k"
done
printf '%s' "$DEMO_GATE_PROD" | npx wrangler secret put DEMO_GATE >/dev/null 2>&1 && echo "  set DEMO_GATE"

echo "== done"
echo "The worker's URL is printed by the deploy step above."
echo "Smoke test it with:"
echo "  curl -s -H 'x-demo-gate: \$DEMO_GATE_PROD' '<url>/api/snapshot?client=4417' | jq '.served'"
