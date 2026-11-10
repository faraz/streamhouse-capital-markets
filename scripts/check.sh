#!/usr/bin/env bash
# The offline half of `npm run check`: what can be caught without touching Confluent.
# Typecheck and tests are the other half, run by npm before this.
set -uo pipefail
shopt -s nullglob
cd "$(dirname "$0")/.."

FAILED=0
fail() { printf '  FAIL  %s\n' "$1"; FAILED=1; }

# A script that does not parse fails halfway through a rebuild, after it has already
# changed the account.
for f in scripts/*.sh .githooks/*; do
  bash -n "$f" 2>/dev/null || fail "$f does not parse: $(bash -n "$f" 2>&1 | head -1)"
done

# The Terraform provider reads these from the environment, and some belong to groups it
# accepts all-or-nothing: one of them set alone in .env breaks every plan. Ours go under
# DEMO_*. This has bitten twice, the second time after the first was documented.
RESERVED='^(CONFLUENT_(ENVIRONMENT|ORGANIZATION)_ID|FLINK_[A-Z_]+|KAFKA_(ID|REST_ENDPOINT|API_KEY|API_SECRET)|SCHEMA_REGISTRY_[A-Z_]+|TABLEFLOW_[A-Z_]+)='
for f in .env .env.example; do
  [ -f "$f" ] || continue
  hits=$(grep -oE "$RESERVED" "$f" | tr -d '=' | tr '\n' ' ')
  [ -z "$hits" ] || fail "$f sets names the Terraform provider reserves: $hits(rename to DEMO_*)"
done

[ "$FAILED" = "0" ] && echo "  scripts parse, no reserved names in .env"
exit "$FAILED"
