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
