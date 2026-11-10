#!/usr/bin/env bash
# Is the pipeline actually up? Answers it without clicking around a console.
#
# No mocks: every check here drives the real CLI or the real query endpoint. An
# integration claim that mocks anything is not an integration claim.
#
#   scripts/verify.sh           full run, including a convergence test (~3 min)
#   scripts/verify.sh --quick   checks only, no produce (~30s)
#
# Exits non-zero if anything fails, so it can gate a rehearsal.
set -uo pipefail
cd "$(dirname "$0")/.."

PATH="/opt/homebrew/bin:$PATH"
set -a; . ./.env; set +a

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

FAILED=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILED=1; }
section() { printf '\n== %s\n' "$1"; }

TOKEN=$(printf '%s:%s' "$CONFLUENT_GLOBAL_KEY" "$CONFLUENT_GLOBAL_SECRET" | base64)
query() {
  curl -s --max-time 40 -X POST "$CONFLUENT_SQL_ENDPOINT" \
    -H "Content-Type: application/json" -H "Authorization: Basic $TOKEN" \
    -d "{\"catalog_name\":\"$DEMO_ENVIRONMENT_ID\",\"database_name\":\"$DEMO_CLUSTER_ID\",\"query\":\"$1\",\"max_result_rows\":200}"
}
rows() { query "$1" | jq -r '.result.data[]? | @tsv'; }

VERIFY_CLIENT="90000"
FILL_LOTS=1000
FILL_PX=5414.0

section "Flink statements"
STMTS=$(confluent flink statement list --cloud aws --region us-east-1 \
  --environment "$DEMO_ENVIRONMENT_ID" -o json 2>/dev/null)
# Names carry a timestamp per rebuild, so each role is checked by its prefix.
for role in n-mq n-ven n-dsk n-cus n-clr n-bor n-evt n-trd g-mq g-evt esc; do
  st=$(printf '%s' "$STMTS" | jq -r --arg r "cm-$role-" \
       '[.[] | select(.name | startswith($r))] | sort_by(.name) | last | .status // empty')
  if [ "$st" = "RUNNING" ]; then pass "$role is RUNNING"; else fail "$role is ${st:-missing}"; fi
done

section "The materialized table"
# Its query runs as a statement the list does not show, and neither the CLI nor the API
# gives it a status. Here it is checked to exist and not be stopped; that it is keeping the
# number is checked by doing it: the freshest as_of below, and the convergence test.
MTS=$(confluent flink materialized-table list --cloud aws --region us-east-1 \
  --environment "$DEMO_ENVIRONMENT_ID" -o json 2>/dev/null)
for t in client_exposure exposure_crossings; do
  MT=$(printf '%s' "$MTS" | jq -r --arg t "$t" '.[] | select(.name==$t) | if .stopped == false then "running" else "stopped" end')
  if [ "$MT" = "running" ]; then pass "$t exists as a materialized table and is not stopped"
  else fail "$t is ${MT:-not a materialized table}"; fi
done

section "Lightning Tables"
LT=$(confluent rtce rtce-topic list --environment "$DEMO_ENVIRONMENT_ID" \
  --cluster "$DEMO_CLUSTER_ID" -o json 2>/dev/null)
for t in client_exposure positions positions_dlq client_escalations; do
  ph=$(printf '%s' "$LT" | jq -r --arg t "$t" '.[] | select(.topic_name==$t) | .phase')
  if [ "$ph" = "ACTIVE" ]; then pass "$t is ACTIVE"; else fail "$t is ${ph:-missing}"; fi
done

section "Queryability"
# ACTIVE does not mean queryable: a table reported ACTIVE and still refused queries for
# another 20 seconds. So the check is a successful query, never a phase.
for t in client_exposure positions positions_dlq client_escalations; do
  if query "SELECT * FROM $t LIMIT 1" | jq -e '.result' >/dev/null 2>&1; then
    pass "$t answers a query"
  else
    fail "$t does not answer: $(query "SELECT * FROM $t LIMIT 1" | jq -r '.errors[0].code // "unknown"')"
  fi
done

section "The book"
BOOK=$(rows "SELECT client_id, limit_util_pct FROM client_exposure ORDER BY limit_util_pct DESC LIMIT 12")
N=$(printf '%s' "$BOOK" | grep -c . || true)
if [ "$N" -ge 10 ]; then pass "book returns $N rows"; else fail "book returned $N rows"; fi
TOP8=$(printf '%s' "$BOOK" | head -8 | cut -f1 | sort | tr '\n' ' ')
EXPECT=$(printf '%s\n' 2286 3318 4417 5560 6154 7405 8803 9021 | tr '\n' ' ')
if [ "$TOP8" = "$EXPECT" ]; then
  pass "the deck's eight clients head the book"
else
  fail "the top of the book is not the deck's eight: $TOP8"
fi
OVER=$(printf '%s' "$BOOK" | awk -F'\t' '$2 > 100 {print $1}' | tr '\n' ' ')
if [ -z "$OVER" ]; then pass "no client is over its limit"; else fail "over limit: $OVER"; fi

section "Someone has always just traded"
# Retried: read moments after the table starts answering, this came back empty once.
FRESH=""
for _try in 1 2 3 4 5; do
  FRESH=$(rows "SELECT client_id, as_of FROM client_exposure ORDER BY as_of DESC LIMIT 1")
  [ -n "$FRESH" ] && break
  sleep 6
done
FRESH_ID=$(printf '%s' "$FRESH" | cut -f1)
FRESH_AT=$(printf '%s' "$FRESH" | cut -f2)
if [ -n "$FRESH_AT" ]; then
  AGE=$(python3 -c "import datetime as d; t=d.datetime.fromisoformat('$FRESH_AT'.replace(' ','T')).replace(tzinfo=d.timezone.utc); print(int((d.datetime.now(d.timezone.utc)-t).total_seconds()))")
  if [ "$AGE" -le 240 ]; then pass "freshest client $FRESH_ID traded ${AGE}s ago"; else fail "freshest client is ${AGE}s old: is the trade feed running?"; fi
else
  fail "could not read the freshest client"
fi

section "Generator"
CONN=$(confluent connect cluster list --environment "$DEMO_ENVIRONMENT_ID" \
  --cluster "$DEMO_CLUSTER_ID" -o json 2>/dev/null)
CN=$(printf '%s' "$CONN" | jq -r '[.[] | select(.status=="RUNNING")] | length')
if [ "${CN:-0}" -ge 1 ]; then pass "$CN connector(s) running"; else fail "no connector running"; fi
SRC=$(rows "SELECT source FROM positions ORDER BY event_time DESC LIMIT 60" | sort -u | tr '\n' ' ')
pass "feeds seen recently: $SRC"

section "Committed schemas match the registry"
# regenerate.sh registers the raw schemas from terraform/schemas, so a file that has drifted
# from what is registered means the repo can no longer rebuild what is running. Found once
# only when a rebuild died on the sixth seed. Compared by field name and type, since the
# registry rewrites the JSON around them.
for f in terraform/schemas/raw.*.avsc; do
  t=$(basename "$f" .avsc | sed 's/^raw\./raw_/')
  shape='[.fields[]|{n:.name,t:(.type|if type=="object" then .type else . end)}]'
  reg=$(curl -s --max-time 20 -u "$CONFLUENT_SR_KEY:$CONFLUENT_SR_SECRET" \
        "$CONFLUENT_SR_ENDPOINT/subjects/${t}-value/versions/latest" | jq -c ".schema|fromjson|$shape" 2>/dev/null)
  com=$(jq -c "$shape" "$f")
  if [ -z "$reg" ]; then fail "$t-value is not registered"
  elif [ "$reg" = "$com" ]; then pass "$f matches $t-value"
  else fail "$f differs from $t-value: registered $reg"; fi
done

section "The agent's MCP endpoint"
MCP=$(curl -s --max-time 40 -X POST "$RTCE_MCP_URL" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Basic $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')
TOOLS=$(printf '%s' "$MCP" | sed -n 's/^data: //p' | jq -r '[.result.tools[].name] | sort | join(",")' 2>/dev/null)
if [ "$TOOLS" = "getMetadata,listTopics,queryData" ]; then
  pass "three tools on the connection"
else
  fail "unexpected tools: ${TOOLS:-none}"
fi

if [ "$QUICK" = "1" ]; then
  section "Result"
  [ "$FAILED" = "0" ] && { printf '  checks passed (quick: no convergence test)\n'; exit 0; }
  printf '  something failed\n'; exit 1
fi

# One record for the verification client on the events topic, framed as the Worker frames
# them. Succeeds only on HTTP 200: the produce is checked, not assumed.
produce_verify() {
  local code
  code=$(curl -s --max-time 40 -o /dev/null -w '%{http_code}' -X POST \
    "$CONFLUENT_REST_ENDPOINT/kafka/v3/clusters/$DEMO_CLUSTER_ID/topics/raw_events/records" \
    -H "Content-Type: application/json" \
    -u "$CONFLUENT_KAFKA_KEY:$CONFLUENT_KAFKA_SECRET" \
    -d "$(python3 - "$VERIFY_CLIENT" "$1" "$FILL_PX" "$RAW_EVENTS_SCHEMA_ID" <<'PY'
import base64, json, struct, sys, datetime
acct, lots, px, sid = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4])
ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')[:23]
payload = json.dumps({"acct": acct, "sym": "ESZ6", "qty": lots, "px": px, "ts": ts, "kind": "verify"}).encode()
framed = b"\x00" + struct.pack(">I", sid) + payload
print(json.dumps({"key": {"type": "STRING", "data": acct},
                  "value": {"type": "BINARY", "data": base64.b64encode(framed).decode()}}))
PY
)")
  [ "$code" = "200" ]
}

section "Convergence: does a produced record reach the served figure?"
BEFORE=$(rows "SELECT exposure_usd FROM client_exposure WHERE client_id = '$VERIFY_CLIENT' LIMIT 1")
if [ -z "$BEFORE" ]; then
  fail "no exposure row for the verification client $VERIFY_CLIENT"
else
  EXPECTED=$(python3 -c "print(float('$BEFORE') + $FILL_LOTS * $FILL_PX)")
  printf '  client %s: %s, expecting %s\n' "$VERIFY_CLIENT" "$BEFORE" "$EXPECTED"

  produce_verify "$FILL_LOTS" || fail "could not produce the verification fill"
  printf '  produced %s lots, waiting for the commit\n' "$FILL_LOTS"

  OK=0
  for i in $(seq 1 20); do
    sleep 15
    NOW=$(rows "SELECT exposure_usd FROM client_exposure WHERE client_id = '$VERIFY_CLIENT' LIMIT 1")
    if [ -n "$NOW" ] && python3 -c "import sys; sys.exit(0 if abs(float('$NOW') - $EXPECTED) < 1.0 else 1)"; then
      pass "converged after $((i*15))s: $NOW"
      OK=1; break
    fi
    printf '  [%ss] %s\n' "$((i*15))" "${NOW:-no row}"
  done
  [ "$OK" = "1" ] || fail "did not converge to $EXPECTED within 300s"

  # Taken back, because the stack now stays up: left in, every run added $5.4m to 90000, and
  # after about six it would be over 85% and escalating. Not waited for; it lands at the next
  # commit like any record.
  if produce_verify "-$FILL_LOTS"; then printf '  took the %s lots back\n' "$FILL_LOTS"
  else fail "could not take the verification fill back: 90000 is $FILL_LOTS lots high"; fi
fi

section "Result"
if [ "$FAILED" = "0" ]; then printf '  the pipeline is up and a produced record reaches the served figure\n'; exit 0; fi
printf '  something failed\n'; exit 1
