# 13: Verification and teardown

**What to build:** Two commands. One answers "is the pipeline actually up?" without
clicking around a console. The other removes the demo's footprint completely, and has
been run rather than merely written.

An untested teardown is how people discover a bill a month later. The trial credit is
finite and expires, so this is not hygiene, it is the thing that keeps the credit for the
rehearsals that matter.

**Blocked by:** 05.

**Status:** ready-for-agent

- [ ] One command produces known records and asserts that the exposure figure converges to the expected value within a bounded time, exiting non-zero if it does not
- [ ] The same command reports the status of each Lightning Table, since a table is queryable only once it is Active
- [ ] A destroy removes every resource the demo owns
- [ ] A destroy leaves the pre-existing environment and cluster untouched, verified by listing them afterwards
- [ ] A destroy has actually been run once, and a following apply rebuilt the pipeline successfully
- [ ] The lighter lever is documented and works: pausing the generators and the Flink statements, which are the two largest meters, without destroying anything
