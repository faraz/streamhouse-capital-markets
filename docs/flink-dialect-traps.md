# Flink and CLI traps hit on this project

Found live against `env-53k1pn` / `lkc-v7wpq15`, AWS us-east-1, CLI v4.82.0, on
2026-11-09. These are **additions** to Confluent's own list at
`research/confluent-agent-skills/flink-ref-dialect-traps.md`, which is the upstream
source of truth. Anything already covered there is not repeated here.

## `--sql "$(cat file.sql)"` fails when the file opens with a comment

Severity: **HIGH**. Costs an hour because the failure looks like a flag problem, not a
parsing problem.

Passing SQL space-separated means the CLI reads a leading `--` comment as the start of
another flag and prints its usage text instead of an error. Every statement in this
project begins with a comment, so every one of them hit it.

```sh
confluent flink statement create NAME --sql "$(cat f.sql)"    # prints usage, does nothing
confluent flink statement create NAME --sql="$(cat f.sql)"    # correct
```

Confluent's own reference records that `--sql-file` does not exist and to read the file
instead, but not that the equals form is then mandatory.

## `'key.format' = 'raw'` requires the key column to be literally named `key`

Severity: **HIGH**. The error is clear once seen: "If a key is provided with a 'raw'
format it must use 'key' as the column name."

Consequence worth thinking about rather than working around: with a raw key the served
table's key column is called `key`, so a Lightning Table predicate has to filter on that
name. Using `'key.format' = 'avro-registry'` instead exposes the key's fields as ordinary
named columns, so the query reads `WHERE client_id = '...'`, which is what the
documentation's own examples look like.

The trade is that a Lightning Table **cannot accept a change to the key schema**, so the
key's shape has to be settled before the table is enabled. Here it is a single
`client_id STRING`.

Append-only tables sidestep the question entirely: they need no key, and a Lightning
Table only requires a record key in upsert mode.

## Statement names are unique, and a collision is nearly silent

Severity: **MEDIUM**. A `create` using a name that already exists does not report a
useful error, so if output is being filtered it looks as though nothing happened at all.
`confluent flink statement delete` also returned success without removing the statement
until `--force` was passed. Check `statement list` rather than trusting the create.

## Status detail is truncated in table output

Severity: **LOW**, but it hides the thing you need. `statement list` in human output
wraps and clips the Status Detail column. Use `-o json` and read `.status_detail` to get
the whole message, which is where the real diagnosis lives.

## The Flink shell needs a real terminal

Severity: **MEDIUM**. `confluent flink shell` cannot take piped stdin: it exits with
"failed to initialize console parser". So the documented EXPLAIN-before-CREATE loop is
not available to a non-interactive agent. The workable substitute is to submit the
statement and read `.status_detail` from `-o json`, which reports parse and type errors
immediately and without consuming CFUs beyond the attempt.

## A materialized table's query is not in the statement list

Severity: **MEDIUM**. Found 2026-11-10 converting `client_exposure`.

`CREATE MATERIALIZED TABLE` submitted with `confluent flink statement create` reaches
COMPLETED: that statement is only the DDL. The continuous query it starts holds a CFU (the
pool's count goes up by one) but does not appear in `confluent flink statement list`, and
`confluent flink materialized-table list` gives no status, only `stopped`. So "is it
running" cannot be read off a status field; check that the table exists and is not stopped,
then check it is doing its job (a fresh `as_of`, a produced record converging).

Two consequences for teardown:

- Deleting the DDL statement leaves the materialized table and its query running. Delete it
  as itself: `confluent flink materialized-table delete <name> --database <lkc> --force`,
  which also deletes its topic and both Schema Registry subjects. Do it after the Lightning
  Table over it and before the topic sweep, or the rebuild's CREATE collides with a table
  whose topic is gone.
- The pool frees the query's CFU about a minute after the delete, not at once.

What did work as written: an explicit `NOT NULL` schema over `SUM(...)` and the division,
`DISTRIBUTED BY (client_id) INTO 2 BUCKETS`, and a GROUP BY on `(client_id, limit_usd)`
under a primary key of `client_id`. The registered key and value schemas are the same as
the plain table's, record names included.
