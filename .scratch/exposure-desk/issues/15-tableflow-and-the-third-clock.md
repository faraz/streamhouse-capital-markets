# 15: Tableflow and the third clock (Tier 2)

**What to build:** The open table that reporting, recalibration and audit read, and the
third rung of the freshness ladder.

Managed storage is now an option, so this needs no bucket, no access role and no cloud
account of its own. The honest claim, which the talk makes and the demo must not
overstate, is that the bytes still exist twice: what disappears is the job, not the copy.

Billed per topic-hour, so it is off by default and enabled by a variable.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] The exposure topic is published as an open table using managed storage, with no external bucket or access role
- [ ] Enabling it is behind a variable that defaults to off
- [ ] The screen shows the open table's age as the third clock, alongside the served age
- [ ] The age reflects the real published commit interval rather than a number invented for the demo
- [ ] The screen states that the data exists twice, so the claim is not overstated
- [ ] Destroying it removes the table and stops the per-topic-hour charge
