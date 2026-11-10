# 17: client_exposure as a materialized table

**What to build:** The exposure figure as one object that is its own query. Today it is a
table (`flink/03-create-client-exposure.sql`) fed by a separate job
(`flink/20-aggregate-exposure.sql`). As a materialized table it is one definition, and in
the console cutaway it shows under Materialized tables as `client_exposure` instead of a
statement named `cm-agg-HHMMSS`. "Flink keeps the number continuously" is what a
materialized table is.

It arrives through a full rebuild (`clear.sh`, `regenerate.sh`, `verify.sh`), never by
adopting the live topic. Adoption needs the old job stopped first or two writers corrupt
the rows, replays the whole history, and does not roll back on failure. A rebuild from an
empty account has none of those.

Facts and traps: `research/flink-materialized-tables-and-agents-2026-11.md` §1 and §5.

**Blocked by:** none.

**Status:** done

- [ ] `client_exposure` is created by one `CREATE MATERIALIZED TABLE` whose query is the exposure aggregation, and `03` and `20` are gone from the rebuild
- [ ] Its key is unchanged (primary key `client_id`, Avro key), so the Lightning Table, the Worker and the analyst read it without a change
- [ ] `clear.sh` removes it in a way that also removes its topic, and `regenerate.sh` creates it in the order the seeds and Lightning Table need
- [ ] The capacity check in `regenerate.sh` still counts the statements this run leaves running
- [ ] `verify.sh` checks it is running and passes in full, including convergence on client 90000
- [ ] It appears in the console under Materialized tables as `client_exposure`
- [ ] Passing by Wednesday 2026-11-11 12:00; otherwise the table-plus-job pipeline is restored with `git revert` and a rebuild, and that is recorded here as the outcome

Watch for: the grammar shows `DISTRIBUTED BY (col)`, not `HASH(col)`; the GROUP BY key is
`(client_id, limit_usd)` while the primary key is `client_id`; an explicit `NOT NULL`
schema may reject `SUM` and the division as nullable; `DROP MATERIALIZED TABLE` deletes the
topic and its schemas.

**Outcome, 2026-11-10:** passing, ahead of the deadline. Rebuilt with `clear.sh` and
`regenerate.sh`; `verify.sh` passed in full, converging on 90000 in 45 s. The key and value
schemas registered for `client_exposure` are byte-identical to the plain table's. The pool
runs 11 CFU with 10 statements listed: the materialized table's query holds a CFU but is
not in the statement list and has no status, so verify checks it exists and is not stopped,
and lets the fresh `as_of` and the convergence test prove it keeps the number. The book was
partial for about four minutes after the rebuild while the table replayed `positions`. The
console view under Materialized tables was not looked at; the CLI lists it as
`client_exposure`. Traps recorded in `docs/flink-dialect-traps.md`.
