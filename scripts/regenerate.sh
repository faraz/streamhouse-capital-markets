#!/usr/bin/env bash
# Rebuild the data plane from nothing: tables, schemas, seeds, Lightning Tables and the
# generator. The control plane (environment, cluster, service accounts, keys, Flink pool)
# is Terraform's and is assumed to be up.
#
# Written before the first clear-down, so the way back existed before the data went.
#
#   scripts/regenerate.sh            tables, seeds, Lightning Tables, generator
#   scripts/regenerate.sh --no-gen   everything except the Datagen connector
#
# Takes roughly six minutes, most of it waiting for Lightning Tables to answer.
set -euo pipefail
cd "$(dirname "$0")/.."
PATH="/opt/homebrew/bin:$PATH"
set -a; . ./.env; set +a

WITH_GEN=1
[ "${1:-}" = "--no-gen" ] && WITH_GEN=0

FLAGS_SQL=(--compute-pool "$DEMO_FLINK_POOL_ID" --database "$DEMO_CLUSTER_ID" --environment "$DEMO_ENVIRONMENT_ID")
FLAGS_ENV=(--cloud aws --region us-east-1 --environment "$DEMO_ENVIRONMENT_ID")
STAMP=$(date +%H%M%S)

say() { printf '\n== %s\n' "$1"; }

# Every statement needs a name no earlier run has used: a create that collides with an
# existing name fails almost silently.
submit() {
  local label="$1" file="$2"
  confluent flink statement create "cm-${label}-${STAMP}" --sql="$(cat "$file")" "${FLAGS_SQL[@]}" --wait >/dev/null 2>&1 || true
  local st
  st=$(confluent flink statement list "${FLAGS_ENV[@]}" -o json 2>/dev/null \
       | jq -r --arg n "cm-${label}-${STAMP}" '.[]|select(.name==$n)|.status')
  # PENDING after --wait means the pool has no CFU left to start it, and it will sit there
  # for good. Seen once as sixteen seeds reporting PENDING while the run carried on.
  local waited=0
  while [ "$st" = "PENDING" ] && [ "$waited" -lt 60 ]; do
    sleep 10; waited=$((waited + 10))
    st=$(confluent flink statement list "${FLAGS_ENV[@]}" -o json 2>/dev/null \
         | jq -r --arg n "cm-${label}-${STAMP}" '.[]|select(.name==$n)|.status')
  done
  printf '  %-22s %s\n' "$label" "${st:-NOT CREATED}"
  if [ "$st" = "PENDING" ]; then
    echo "  still PENDING after 60s: the compute pool is out of CFU (see the capacity check above)" >&2
    return 1
  fi
  [ -n "$st" ] && [ "$st" != "FAILED" ]
}

# Each running statement holds at least one CFU. This run leaves CONTINUOUS statements
# running and needs one more slot at a time for the bounded seeds, so check the pool has
# room before changing anything rather than finding out halfway through. Ten normalizers and
# guards, and the materialized table's query, which holds a CFU like any statement although
# the statement list does not show it.
CONTINUOUS=11
capacity_check() {
  local pool max cur
  pool=$(confluent flink compute-pool describe "$DEMO_FLINK_POOL_ID" -o json)
  max=$(printf '%s' "$pool" | jq -r '.max_cfu')
  # The CLI spells the field with three r's; accept the corrected spelling too.
  cur=$(printf '%s' "$pool" | jq -r '.currrent_cfu // .current_cfu // 0')
  printf '  pool %s: %s of %s CFU in use, this run needs %s more\n' "$DEMO_FLINK_POOL_ID" "$cur" "$max" "$((CONTINUOUS + 1))"
  if [ $((max - cur)) -lt $((CONTINUOUS + 1)) ]; then
    echo "  not enough room: run scripts/clear.sh first, or raise flink_max_cfu in terraform/variables.tf" >&2
    return 1
  fi
}

confluent environment use "$DEMO_ENVIRONMENT_ID" >/dev/null 2>&1
confluent kafka cluster use "$DEMO_CLUSTER_ID" >/dev/null 2>&1

say "capacity"
capacity_check

say "raw topics"
for t in raw_mq_intraday raw_venue raw_desk_sheet raw_custodial raw_clearing raw_book_of_record raw_events raw_trades; do
  confluent kafka topic create "$t" --partitions 1 >/dev/null 2>&1 && echo "  created $t" || echo "  $t already there"
done

sleep 12

say "schemas on the raw topics"
# One record per source registers its schema and lets Flink auto-map the table. The
# normalizing statements must exist before real data flows, because a statement only
# sees what arrives after it starts.
# Retried, because a topic created a moment ago may not have propagated yet: the CLI
# reference puts that at ten to fifteen seconds, and the first run of this script died on
# the fourth topic for exactly that reason. A duplicate seed is harmless: these records
# only register a schema, and a normalizer counts nothing that arrived before it started.
produce() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if printf '%s\n' "$3" | confluent kafka topic produce "$1" --value-format avro --schema "$2" \
         --api-key "$CONFLUENT_KAFKA_KEY" --api-secret "$CONFLUENT_KAFKA_SECRET" \
         --schema-registry-api-key "$CONFLUENT_SR_KEY" --schema-registry-api-secret "$CONFLUENT_SR_SECRET" >/dev/null 2>&1; then
      echo "  seeded $1"
      return 0
    fi
    sleep 5
  done
  echo "  FAILED to seed $1 after 6 attempts" >&2
  return 1
}
produce raw_mq_intraday     terraform/schemas/raw.mq_intraday.avsc    '{"acct":"4417","sym":"ESU6","qty":240,"px":5412.25,"ts":"2026-11-09 14:06:19"}'
produce raw_venue           terraform/schemas/raw.venue.avsc          '{"acct":"4417","sym":"ESU6","q":120,"p":5412.5}'
produce raw_desk_sheet      terraform/schemas/raw.desk_sheet.avsc     '{"account":"6154","symbol":"NQZ6","quantity":"300","price":"20114.75"}'
produce raw_custodial       terraform/schemas/raw.custodial.avsc      '{"acct_no":"8803","instrument":"ESU6","units":440,"value_cents":238139000}'
produce raw_clearing        terraform/schemas/raw.clearing.avsc       '{"acct":"3318","total_due_cents":1412000,"statement_date":"2026-11-08"}'
produce raw_book_of_record  terraform/schemas/raw.book_of_record.avsc '{"client":"9021","sym":"ESU6","qty":310,"px":5413.0,"change_type":"INSERT","changed_at":"2026-11-09 14:12:40"}'
produce raw_trades          terraform/schemas/raw.trades.avsc         '{"acct":10000,"sym":"ESU6","qty":100,"px":5412.0}'

say "the events topic's JSON Schema"
SCHEMA=$(jq -c -n '{type:"object",title:"DemoEvent",properties:{acct:{type:"string"},sym:{type:"string"},qty:{type:"integer"},px:{type:"number"},ts:{type:"string"},kind:{type:"string"}},required:["acct","sym","qty","px","ts","kind"],additionalProperties:false}')
SID=$(curl -s -u "$CONFLUENT_SR_KEY:$CONFLUENT_SR_SECRET" \
  -X POST "$CONFLUENT_SR_ENDPOINT/subjects/raw_events-value/versions" \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d "$(jq -c -n --arg s "$SCHEMA" '{schemaType:"JSON", schema:$s}')" | jq -r '.id // empty')
if [ -n "$SID" ]; then
  sed -i '' "s/^RAW_EVENTS_SCHEMA_ID=.*/RAW_EVENTS_SCHEMA_ID=$SID/" .env 2>/dev/null \
    || echo "RAW_EVENTS_SCHEMA_ID=$SID" >> .env
  echo "  schema id $SID"
else
  echo "  WARNING: could not register the events schema" >&2
fi

say "tables"
submit ddl-pos  flink/01-create-positions.sql
submit ddl-lim  flink/02-create-client-limits.sql
submit ddl-dlq  flink/06-create-positions-dlq.sql

say "normalizers and guards, before any volume arrives"
submit n-mq  flink/10-normalize-mq-intraday.sql
submit n-ven flink/12-normalize-venue.sql
submit n-dsk flink/13-normalize-desk-sheet.sql
submit n-cus flink/14-normalize-custodial.sql
submit n-clr flink/15-normalize-clearing.sql
submit n-bor flink/16-normalize-book-of-record.sql
submit n-evt flink/17-normalize-events.sql
submit n-trd flink/19-normalize-trades.sql
submit g-mq  flink/11-guard-mq-intraday.sql
submit g-evt flink/18-guard-events.sql

say "the book"
submit seed-lim flink/04-seed-client-limits.sql
submit seed-pos flink/05-seed-opening-positions.sql
submit seed-vlim flink/07-seed-verification-client.sql
submit seed-vpos flink/08-seed-verification-balance.sql
# Limits for 8,000 clients, opening balances for 4,000 of them. The rest enter the book
# the first time the trade feed reaches them, which is how the book grows while the demo
# runs. Limits must land before balances, or a balance has nothing to join against.
[ -f flink/generated/book-limits-8.sql ] || node scripts/generate-book-seed.mjs 8000 4000 >/dev/null
for f in flink/generated/book-limits-*.sql; do submit "bk-$(basename "$f" .sql | sed 's/book-//')" "$f"; done
for f in flink/generated/book-positions-*.sql; do submit "bk-$(basename "$f" .sql | sed 's/book-//')" "$f"; done

say "the exposure figure, as a materialized table"
# After the seeds, because it reads positions from the beginning and its first commit should
# hold the whole book; before the Lightning Tables, because it creates the topic they serve.
# The create statement COMPLETES; the query it starts runs on under the table's own name.
submit mt-exp flink/20-materialize-client-exposure.sql
# The create's COMPLETED says only that the DDL ran, so the table is listed back.
confluent flink materialized-table list "${FLAGS_ENV[@]}" -o json 2>/dev/null \
  | jq -e '.[]|select(.name=="client_exposure" and .stopped == false)' >/dev/null \
  || { echo "  client_exposure is not listed as a running materialized table" >&2; exit 1; }
echo "  client_exposure listed, not stopped"

say "Lightning Tables"
# The description is the only documentation an MCP agent gets for a topic, and it is
# capped at 256 characters. Held in variables because a parenthesis inside a case branch
# in a command substitution does not parse.
DESC_EXPOSURE="Current exposure per client, keyed by client_id, with limit_usd, limit_util_pct and as_of. Query by client_id for one client, or ORDER BY limit_util_pct DESC for the book."
DESC_POSITIONS="Append-only position records, one row per fact: client_id, symbol, quantity, price, notional_usd, event_time, source feed, ingest_lag_ms for feed staleness. Use for recent activity. Not the exposure total: that is client_exposure."
DESC_DLQ="Records rejected by the Flink guard: well-formed but wrong, with the reason they were refused."

enable_lt() {
  confluent rtce rtce-topic create --cloud aws --region us-east-1 --topic-name "$1" \
    --description "$2" --environment "$DEMO_ENVIRONMENT_ID" --cluster "$DEMO_CLUSTER_ID" >/dev/null 2>&1 \
    && echo "  enabling $1" || echo "  $1 already enabled"
}
enable_lt client_exposure "$DESC_EXPOSURE"
enable_lt positions "$DESC_POSITIONS"
enable_lt positions_dlq "$DESC_DLQ"

say "the dead-letter table's first record"
# A Lightning Table over a topic that has never had a record reports ACTIVE and answers
# DP_TABLE_NOT_AVAILABLE, so without this the presenter's fat finger would be the first
# record it ever saw. One rejected record for the verification client warms it. The screen
# reads the dead letters only for the client it follows, so this never appears there.
warm_dlq() {
  local sid body code
  sid=$(sed -n 's/^RAW_EVENTS_SCHEMA_ID=//p' .env)
  body=$(python3 - "$sid" <<'PY2'
import base64, json, struct, sys, datetime
sid = int(sys.argv[1])
ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')[:23]
payload = json.dumps({"acct": "90000", "sym": "ESU6", "qty": 2400000, "px": 5412.0, "ts": ts, "kind": "setup"}).encode()
framed = b"\x00" + struct.pack(">I", sid) + payload
print(json.dumps({"key": {"type": "STRING", "data": "90000"},
                  "value": {"type": "BINARY", "data": base64.b64encode(framed).decode()}}))
PY2
)
  code=$(curl -s --max-time 40 -o /dev/null -w '%{http_code}' -X POST \
    "$CONFLUENT_REST_ENDPOINT/kafka/v3/clusters/$DEMO_CLUSTER_ID/topics/raw_events/records" \
    -H "Content-Type: application/json" -u "$CONFLUENT_KAFKA_KEY:$CONFLUENT_KAFKA_SECRET" -d "$body")
  if [ "$code" = "200" ]; then echo "  produced one fat finger for client 90000"
  else echo "  WARNING: could not produce the warm-up record (HTTP $code)" >&2; fi
}
warm_dlq

if [ "$WITH_GEN" = "1" ]; then
  say "trade feeds"
  # Two feeds into one topic: established clients trading both ways, new clients opening
  # positions. Split so the first wander and the second grow the book.
  for cfg in connectors/*.json; do
    jq --arg k "$CONFLUENT_KAFKA_KEY" --arg s "$CONFLUENT_KAFKA_SECRET" \
      '.config["kafka.api.key"]=$k | .config["kafka.api.secret"]=$s' "$cfg" > /tmp/gen-regen.json
    confluent connect cluster create --config-file /tmp/gen-regen.json \
      --environment "$DEMO_ENVIRONMENT_ID" --cluster "$DEMO_CLUSTER_ID" >/dev/null 2>&1 \
      && echo "  created $(jq -r .name "$cfg")" || echo "  $(jq -r .name "$cfg") already there"
  done
fi

say "waiting for the book to be right"
# Not done until it is: for minutes after the create, client_exposure replays every position
# and serves partial totals, and the screen would show them. Right means the deck's eight
# head the book and the verification client has its row, read back by a real query, and with
# the feeds on, that someone traded in the last four minutes. Ticket 16's agent must start
# after this, or it takes the replay for new crossings.
TOKEN=$(printf '%s:%s' "$CONFLUENT_GLOBAL_KEY" "$CONFLUENT_GLOBAL_SECRET" | base64)
rows() {
  curl -s --max-time 40 -X POST "$CONFLUENT_SQL_ENDPOINT" \
    -H "Content-Type: application/json" -H "Authorization: Basic $TOKEN" \
    -d "{\"catalog_name\":\"$DEMO_ENVIRONMENT_ID\",\"database_name\":\"$DEMO_CLUSTER_ID\",\"query\":\"$1\",\"max_result_rows\":200}" \
    | jq -r '.result.data[]? | @tsv' 2>/dev/null
}
EXPECT=$(printf '%s\n' 2286 3318 4417 5560 6154 7405 8803 9021 | tr '\n' ' ')
right=0
for _try in $(seq 1 40); do
  top=$(rows "SELECT client_id FROM client_exposure ORDER BY limit_util_pct DESC LIMIT 8" | sort | tr '\n' ' ')
  verify=$(rows "SELECT client_id FROM client_exposure WHERE client_id = '90000' LIMIT 1")
  fresh=1
  if [ "$WITH_GEN" = "1" ]; then
    at=$(rows "SELECT as_of FROM client_exposure ORDER BY as_of DESC LIMIT 1")
    fresh=$(python3 -c "import datetime as d,sys; v='$at'.strip()
if not v: print(0); sys.exit()
t=d.datetime.fromisoformat(v.replace(' ','T')).replace(tzinfo=d.timezone.utc)
print(1 if (d.datetime.now(d.timezone.utc)-t).total_seconds() <= 240 else 0)")
  fi
  if [ "$top" = "$EXPECT" ] && [ -n "$verify" ] && [ "$fresh" = "1" ]; then right=1; break; fi
  sleep 15
done
if [ "$right" = "1" ]; then
  echo "  the deck's eight head the book, 90000 has its row, and the figures are current"
else
  echo "  the book was still not right after 10 minutes: run scripts/verify.sh to see what is off" >&2
  exit 1
fi

say "done"
echo "  Check with: scripts/verify.sh"
