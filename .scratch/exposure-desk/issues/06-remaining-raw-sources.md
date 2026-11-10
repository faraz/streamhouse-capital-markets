# 06: The remaining raw sources, normalized into one record

**What to build:** The normalization story made real rather than represented. Six raw
sources, deliberately divergent, collapsing into one governed record. One carries an
event time and one carries none; one sends every field as a string; one counts in integer
cents; one sends only a total; one is a change stream standing in for reading the book of
record at source.

The point an audience must be able to see is that no two sources agree on shape, and that
everything downstream reads one thing instead of six.

**Blocked by:** 05.

**Status:** ready-for-agent

- [ ] All six raw topics exist with their own registered schemas, and the schemas genuinely differ in field names, types and whether a time is present
- [ ] The normalizing statement reconciles all six into the single record shape, converting cents to currency, parsing string quantities, and deriving an event time for the source that has none
- [ ] A record's age is computed from its own event time, so the record knows how old it is
- [ ] Each normalized record names the source it came from
- [ ] Generators are provisioned for as many sources as the count variable selects, so three can run for a rehearsal and six for the talk
- [ ] Consuming the normalized topic shows records from every provisioned source under one schema
