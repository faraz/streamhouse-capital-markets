#!/usr/bin/env bash
# Stop the producers and clear the data, keeping everything Terraform owns.
#
# Goes: generator, then statements, then Lightning Tables, then the materialized table,
# then topics. That order matters. Deleting a topic while a Lightning Table sits over it
# orphans the table, and deleting it while a statement writes to it fails the statement
# noisily. The materialized table is deleted as itself, which takes its query, its topic and
# its schemas with it: deleting only the topic would leave a table that no longer has one,
# and the rebuild's CREATE would then collide with it.
#
# What survives: the environment, the cluster, the service accounts and their keys, and
# the Flink compute pool, which costs nothing while no statement runs. Schema Registry
# subjects also survive, so a rebuild re-registers the same schemas and gets the same ids,
# except client_exposure's, which go with the materialized table and come back identical.
#
# Rebuild with scripts/regenerate.sh.
set -uo pipefail
cd "$(dirname "$0")/.."
PATH="/opt/homebrew/bin:$PATH"
set -a; . ./.env; set +a

FLAGS_ENV=(--cloud aws --region us-east-1 --environment "$DEMO_ENVIRONMENT_ID")
say() { printf '\n== %s\n' "$1"; }

confluent environment use "$DEMO_ENVIRONMENT_ID" >/dev/null 2>&1
confluent kafka cluster use "$DEMO_CLUSTER_ID" >/dev/null 2>&1

say "generators"
for id in $(confluent connect cluster list --environment "$DEMO_ENVIRONMENT_ID" \
            --cluster "$DEMO_CLUSTER_ID" -o json 2>/dev/null | jq -r '.[].id'); do
  confluent connect cluster delete "$id" --environment "$DEMO_ENVIRONMENT_ID" \
    --cluster "$DEMO_CLUSTER_ID" --force >/dev/null 2>&1 && echo "  deleted $id" || echo "  could not delete $id"
done

say "Flink statements"
# Deleted rather than stopped, so nothing resumes on top of topics that are about to go. The
# exposure figure's accumulated state is not here: it goes with the materialized table.
for n in $(confluent flink statement list "${FLAGS_ENV[@]}" -o json 2>/dev/null \
           | jq -r '.[]|select(.name|startswith("cm-"))|.name'); do
  confluent flink statement stop "$n" "${FLAGS_ENV[@]}" >/dev/null 2>&1
  confluent flink statement delete "$n" "${FLAGS_ENV[@]}" --force >/dev/null 2>&1 && echo "  deleted $n"
done

say "Lightning Tables"
for t in $(confluent rtce rtce-topic list --environment "$DEMO_ENVIRONMENT_ID" \
           --cluster "$DEMO_CLUSTER_ID" -o json 2>/dev/null | jq -r '.[].topic_name'); do
  confluent rtce rtce-topic delete "$t" --environment "$DEMO_ENVIRONMENT_ID" \
    --cluster "$DEMO_CLUSTER_ID" --force >/dev/null 2>&1 && echo "  deleted $t"
done

say "materialized tables"
# Only this cluster's: the list spans the environment.
for t in $(confluent flink materialized-table list "${FLAGS_ENV[@]}" -o json 2>/dev/null \
           | jq -r --arg db "$DEMO_CLUSTER_ID" '.[]|select(.database==$db)|.name'); do
  confluent flink materialized-table delete "$t" "${FLAGS_ENV[@]}" --database "$DEMO_CLUSTER_ID" --force >/dev/null 2>&1 \
    && echo "  deleted $t" || echo "  could not delete $t"
done

say "topics"
for t in $(confluent kafka topic list -o json 2>/dev/null \
           | jq -r '.[]|select(.name|startswith("_")|not)|.name'); do
  confluent kafka topic delete "$t" --force >/dev/null 2>&1 && echo "  deleted $t" || echo "  could not delete $t"
done

say "what is left"
printf '  connectors: %s\n' "$(confluent connect cluster list --environment "$DEMO_ENVIRONMENT_ID" --cluster "$DEMO_CLUSTER_ID" -o json 2>/dev/null | jq -r 'length')"
printf '  statements: %s\n' "$(confluent flink statement list "${FLAGS_ENV[@]}" -o json 2>/dev/null | jq -r '[.[]|select(.status=="RUNNING")]|length')"
printf '  materialized tables: %s\n' "$(confluent flink materialized-table list "${FLAGS_ENV[@]}" -o json 2>/dev/null | jq -r 'length')"
printf '  lightning tables: %s\n' "$(confluent rtce rtce-topic list --environment "$DEMO_ENVIRONMENT_ID" --cluster "$DEMO_CLUSTER_ID" -o json 2>/dev/null | jq -r 'length')"
printf '  topics: %s\n' "$(confluent kafka topic list -o json 2>/dev/null | jq -r '[.[]|select(.name|startswith("_")|not)]|length')"
echo
echo "  The cluster, environment, service accounts, keys and Flink pool are untouched."
echo "  A cluster at zero consumption bills nothing. Rebuild with scripts/regenerate.sh."
