# 05: One source end to end

**What to build:** The tracer bullet through every Confluent layer, using a single source.
One raw topic with its own schema, one fully managed generator writing into it, a Flink
statement normalizing it into the one governed record shape, a second maintaining current
exposure per client, a Lightning Table over the result, and a real query returning a real
exposure figure.

Narrow on purpose. Breadth comes in 06, 07 and 08, and all three are cheap once this path
exists.

**Blocked by:** 01, 02.

**Status:** done

- [ ] One raw topic exists with a registered schema, and a fully managed generator is writing to it continuously
- [ ] A Flink statement normalizes that source into the shared record shape, carrying a key, an event time, its source and its own age
- [ ] A Flink statement maintains current exposure per client as a stateful aggregation, applying each record as a delta rather than re-summing from the start
- [ ] The exposure topic is compacted so that upsert mode is selected, and uses a raw string key rather than a key schema, because a Lightning Table cannot accept a key schema change later
- [ ] Limit utilisation and the as-of time are **stored columns** on the exposure record, not computed in the query
- [ ] A Lightning Table on the exposure topic reaches status Active
- [ ] A point query for one client returns its exposure, its limit, its utilisation and its as-of time, using the schema's own column name in the predicate
- [ ] The generator can be paused without destroying anything, since it is one of the two largest meters
