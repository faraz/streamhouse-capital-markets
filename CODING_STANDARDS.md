# Coding standards

Read at review. What a check can catch is in `npm run check`; these are the calls it cannot make.

## A mutating command's result is checked

In `scripts/`, every call that changes the account (create, delete, produce, enable) has its outcome read back: its exit status, or the resource listed afterwards. Output may be quietened, but a failure must still stop the script or be printed. Silenced creates and deletes hid name collisions and failed teardowns more than once.

## Readiness is a real operation

A thing is ready when it does its job: a Lightning Table when a query returns, a statement when it reaches RUNNING or COMPLETED, a topic when a produce succeeds. A status field is not enough: tables reported ACTIVE while refusing queries, and statements reported PENDING forever on a full pool. Where readiness is checked, look for the real operation, retried with a bound.
