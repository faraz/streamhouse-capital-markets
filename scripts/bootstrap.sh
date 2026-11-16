#!/usr/bin/env bash
# Move the demo into an environment someone else owns the account around: adopt the
# environment, its cluster and its service account, and write the .env and .dev.vars every
# other script reads. It makes three things, all inside that environment and all belonging
# to that service account: a Flink compute pool, a Kafka key and a Schema Registry key.
#
# It creates no environment, no cluster, no service account and no role binding, and it
# names the environment on every command it runs. Terraform is not used here: what it made
# in the first account (three service accounts and their bindings) lives at organization
# level, which is not ours to touch in a shared one.
#
# .env must already say which environment, and nothing else is required of it:
#
#   DEMO_ENVIRONMENT_ID=env-...       the one environment this may touch
#   DEMO_CLUSTER_ID=lkc-...           optional if the environment has exactly one cluster
#   DEMO_SERVICE_ACCOUNT=sa-...       optional if exactly one is its EnvironmentAdmin
#   CONFLUENT_GLOBAL_KEY / _SECRET    that service account's Global key, which queries
#
#   scripts/bootstrap.sh --check        say what is there and what would be made; changes nothing
#   scripts/bootstrap.sh                the same, then ask, then do it
#   scripts/bootstrap.sh --from PATH    carry ANTHROPIC_API_KEY and DEMO_GATE_PROD from another .env
#   scripts/bootstrap.sh --yes          do not ask
#
# Safe to run again: it reuses the pool by name and the keys already in .env. Nothing here
# creates data. That is regenerate.sh. The whole move is in docs/new-account.md.
set -euo pipefail
cd "$(dirname "$0")/.."
PATH="/opt/homebrew/bin:$PATH"

PREFIX="streamhouse-cm"
POOL_NAME="$PREFIX-pool"
MAX_CFU=30
# Every other script says us-east-1 outright, so this one refuses a cluster anywhere else.
REGION="us-east-1"

CHECK=0; YES=0; FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --yes)   YES=1 ;;
    --from)  FROM="${2:?--from needs a path}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n== %s\n' "$1"; }
die() { printf '  %s\n' "$1" >&2; exit 1; }
# Read one value out of an env file without sourcing it.
val() { [ -f "$1" ] && sed -n "s/^$2=//p" "$1" | head -1 || true; }
# Written as each value is known rather than at the end, so a run that dies halfway has not
# lost a secret that is shown only once. Not sed: a secret may hold a slash.
put() {
  { grep -v "^$1=" .env || true; printf '%s=%s\n' "$1" "$2"; } > .env.tmp
  mv .env.tmp .env; chmod 600 .env
}

for tool in confluent jq openssl; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done
[ -z "$FROM" ] || [ -f "$FROM" ] || die "--from $FROM does not exist"
ENV_ID=$(val .env DEMO_ENVIRONMENT_ID)
[ -n "$ENV_ID" ] || die "set DEMO_ENVIRONMENT_ID in .env: this script does not choose an environment"

say "where this would land"
ORG=$(confluent organization describe -o json 2>/dev/null) \
  || die "not logged in. Run: confluent login"
ORG_ID=$(printf '%s' "$ORG" | jq -r '.id')
printf '  organization     %s (%s)\n' "$(printf '%s' "$ORG" | jq -r '.name')" "$ORG_ID"

ENV_NAME=$(confluent environment list -o json | jq -r --arg e "$ENV_ID" '.[]|select(.id==$e)|.name')
[ -n "$ENV_NAME" ] || die "$ENV_ID is not an environment in this organization: wrong login, or an old .env"
printf '  environment      %s (%s)\n' "$ENV_NAME" "$ENV_ID"

CLUSTERS=$(confluent kafka cluster list --environment "$ENV_ID" -o json)
CLUSTER_ID=$(val .env DEMO_CLUSTER_ID)
if [ -z "$CLUSTER_ID" ]; then
  [ "$(printf '%s' "$CLUSTERS" | jq 'length')" = "1" ] \
    || die "$ENV_ID does not have exactly one cluster: set DEMO_CLUSTER_ID in .env"
  CLUSTER_ID=$(printf '%s' "$CLUSTERS" | jq -r '.[0].id')
fi
CLUSTER=$(printf '%s' "$CLUSTERS" | jq -c --arg c "$CLUSTER_ID" '.[]|select(.id==$c)')
[ -n "$CLUSTER" ] || die "$CLUSTER_ID is not a cluster in $ENV_ID"
printf '  cluster          %s (%s, %s, %s %s)\n' "$(printf '%s' "$CLUSTER" | jq -r '.name')" "$CLUSTER_ID" \
  "$(printf '%s' "$CLUSTER" | jq -r '.type')" "$(printf '%s' "$CLUSTER" | jq -r '.cloud')" "$(printf '%s' "$CLUSTER" | jq -r '.region')"
[ "$(printf '%s' "$CLUSTER" | jq -r '.cloud + " " + .region')" = "aws $REGION" ] \
  || die "the scripts are written for AWS $REGION"

SR=$(confluent schema-registry cluster describe --environment "$ENV_ID" -o json 2>/dev/null) \
  || die "$ENV_ID has no Schema Registry"
SR_ID=$(printf '%s' "$SR" | jq -r '.cluster')
printf '  schema registry  %s\n' "$SR_ID"

SA=$(val .env DEMO_SERVICE_ACCOUNT)
if [ -z "$SA" ]; then
  ADMINS=$(confluent iam rbac role-binding list --environment "$ENV_ID" --role EnvironmentAdmin -o json \
           | jq -r '[.[].principal|select(startswith("User:sa-"))|ltrimstr("User:")]|unique|.[]')
  [ "$(printf '%s\n' "$ADMINS" | grep -c .)" = "1" ] \
    || die "$ENV_ID does not have exactly one service account as EnvironmentAdmin: set DEMO_SERVICE_ACCOUNT in .env"
  SA="$ADMINS"
fi
SA_NAME=$(confluent iam service-account list -o json | jq -r --arg s "$SA" '.[]|select(.id==$s)|.name')
[ -n "$SA_NAME" ] || die "$SA is not a service account in this organization"
printf '  service account  %s (%s)\n' "$SA_NAME" "$SA"

POOL_ID=$(confluent flink compute-pool list --environment "$ENV_ID" -o json \
          | jq -r --arg n "$POOL_NAME" '[.[]|select(.name==$n)][0].id // empty')
echo
printf '  flink pool       %s\n' "${POOL_ID:-none called $POOL_NAME: would be created in $ENV_ID, max $MAX_CFU CFU}"
for pair in "CONFLUENT_KAFKA_KEY:Kafka key on $CLUSTER_ID" "CONFLUENT_SR_KEY:Schema Registry key on $SR_ID"; do
  k=${pair%%:*}; what=${pair#*:}
  if [ -n "$(val .env "$k")" ]; then printf '  %-16s in .env, would be reused\n' "${what%% on *}"
  else printf '  %-16s would be minted for %s: %s\n' "${what%% on *}" "$SA" "$what"; fi
done
if [ -n "$(val .env CONFLUENT_GLOBAL_KEY)" ] && [ -n "$(val .env CONFLUENT_GLOBAL_SECRET)" ]; then
  printf '  global key       in .env\n'
else
  printf '  global key       NOT in .env. This script does not mint one: put %s'"'"'s in .env\n' "$SA_NAME"
fi

if [ "$CHECK" = "1" ]; then
  echo
  echo "  --check: nothing was changed."
  exit 0
fi

if [ "$YES" = "0" ]; then
  printf '\n  Make the above in %s (%s) and nowhere else? Type yes: ' "$ENV_NAME" "$ENV_ID"
  read -r answer
  [ "$answer" = "yes" ] || die "stopped, nothing changed"
fi

say ".env"
put DEMO_ORGANIZATION_ID "$ORG_ID"
put DEMO_CLUSTER_ID "$CLUSTER_ID"
put DEMO_SERVICE_ACCOUNT "$SA"
put CONFLUENT_REST_ENDPOINT "$(confluent kafka cluster describe "$CLUSTER_ID" --environment "$ENV_ID" -o json | jq -r '.rest_endpoint')"
put CONFLUENT_BOOTSTRAP "$(printf '%s' "$CLUSTER" | jq -r '.endpoint')"
put CONFLUENT_SR_ENDPOINT "$(printf '%s' "$SR" | jq -r '.endpoint_url')"
put CONFLUENT_SQL_ENDPOINT "https://sql.$REGION.aws.confluent.cloud/query/v1"
put RTCE_MCP_URL "https://mcp.$REGION.aws.confluent.cloud/mcp/v1/context-engine/organizations/$ORG_ID/environments/$ENV_ID/kafka-clusters/$CLUSTER_ID"
# The two values that are not Confluent's and so do not change with the account. The gate
# is baked into the deployed bundle, so keeping it spares a rebuild of the screen.
for k in ANTHROPIC_API_KEY DEMO_GATE_PROD; do
  [ -n "$(val .env "$k")" ] && continue
  v=$(val "${FROM:-/dev/null}" "$k")
  [ -z "$v" ] || { put "$k" "$v"; echo "  carried $k"; }
done
[ -n "$(val .env DEMO_GATE_PROD)" ] || { put DEMO_GATE_PROD "$(openssl rand -hex 16)"; echo "  generated DEMO_GATE_PROD"; }
[ -n "$(val .env ANTHROPIC_API_KEY)" ] || echo "  ANTHROPIC_API_KEY is not set: add it to .env before the analyst is asked anything"
echo "  ids and endpoints written"

say "flink pool"
# An idle pool costs nothing; statements bill per minute while they run. max_cfu is the
# spend ceiling: the rebuild holds 13 CFU continuously and needs a fourteenth for seeds.
if [ -z "$POOL_ID" ]; then
  POOL_ID=$(confluent flink compute-pool create "$POOL_NAME" --cloud aws --region "$REGION" \
            --max-cfu "$MAX_CFU" --environment "$ENV_ID" -o json | jq -r '.id // empty')
  [ -n "$POOL_ID" ] || die "could not create the pool"
  echo "  created $POOL_ID"
else
  echo "  reusing $POOL_ID"
fi
put DEMO_FLINK_POOL_ID "$POOL_ID"

say "keys"
# One principal for everything, where the first account had three: the service account is
# the environment's admin, so its keys can produce, register schemas and run the feeds.
mint() {
  local name="$1" resource="$2" what="$3" K
  if [ -n "$(val .env "${name}_KEY")" ]; then echo "  reusing $(val .env "${name}_KEY") ($what)"; return 0; fi
  K=$(confluent api-key create --resource "$resource" --service-account "$SA" --environment "$ENV_ID" \
      --description "$PREFIX: $what" -o json)
  [ -n "$(printf '%s' "$K" | jq -r '.api_key // empty')" ] || die "the CLI did not return a key for $resource"
  put "${name}_KEY" "$(printf '%s' "$K" | jq -r '.api_key')"
  put "${name}_SECRET" "$(printf '%s' "$K" | jq -r '.api_secret')"
  echo "  minted $(val .env "${name}_KEY") ($what)"
}
mint CONFLUENT_KAFKA "$CLUSTER_ID" "produces to $CLUSTER_ID and runs the trade feeds"
mint CONFLUENT_SR    "$SR_ID"      "registers schemas in $SR_ID"

say ".dev.vars"
# What the local Worker reads. RAW_EVENTS_SCHEMA_ID is not known yet: regenerate.sh
# registers that schema and writes its id into both files.
{
  for k in CONFLUENT_SQL_ENDPOINT CONFLUENT_GLOBAL_KEY CONFLUENT_GLOBAL_SECRET \
           DEMO_ENVIRONMENT_ID DEMO_CLUSTER_ID RTCE_MCP_URL ANTHROPIC_API_KEY \
           CONFLUENT_REST_ENDPOINT CONFLUENT_KAFKA_KEY CONFLUENT_KAFKA_SECRET; do
    printf '%s=%s\n' "$k" "$(val .env "$k")"
  done
  echo "DEMO_GATE=local-dev"
} > .dev.vars
chmod 600 .dev.vars
echo "  written"

say "done"
echo "  $ENV_NAME ($ENV_ID) is ready and holds no data."
if [ -z "$(val .env CONFLUENT_GLOBAL_SECRET)" ]; then
  echo "  Still missing: CONFLUENT_GLOBAL_KEY and CONFLUENT_GLOBAL_SECRET in .env. Add them and"
  echo "  run this again to refresh .dev.vars; regenerate.sh cannot finish without them."
fi
echo "  Next: scripts/regenerate.sh, then scripts/verify.sh, then scripts/deploy.sh."
