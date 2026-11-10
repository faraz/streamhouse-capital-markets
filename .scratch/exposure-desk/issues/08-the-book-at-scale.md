# 08: The book at scale

**What to build:** The risk officer's view, at a size that survives a technical audience.
Four thousand clients, each with a limit, and a sorted top-N query that answers in under a
second. The eight clients named in the deck sit at the top of the sort so the narrative
still lands on the one the talk follows.

A sorted top-N works directly on a Lightning Table and needs no precomputed ranking
topic, but the column it sorts on must be stored rather than computed.

**Blocked by:** 05.

**Status:** done

- [ ] Four thousand clients have limits, seeded idempotently so re-running changes nothing
- [ ] The deck's eight clients carry their stated limits and exposures and occupy the top of the sort
- [ ] A query returns the top clients ordered by limit utilisation descending, returning at most 200 rows
- [ ] The query answers in under a second against the full set
- [ ] Generated exposures stay inside a band, so no client crosses a threshold without a narrative event
