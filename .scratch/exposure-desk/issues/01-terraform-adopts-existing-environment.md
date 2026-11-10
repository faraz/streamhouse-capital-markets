# 01: Terraform adopts the existing environment and cluster

**What to build:** Terraform plans cleanly against the real account and owns only the
demo's own resources. The `Capital-Markets` environment and the `brokerage_0` Standard
cluster already exist and were created by hand, so they are read as pre-existing facts.
A destroy must remove the demo's footprint and leave both of them standing.

**Blocked by:** None (can start immediately).

**Status:** done

- [ ] The environment and the Kafka cluster are read as data, never declared as managed resources
- [ ] `terraform plan` succeeds using Cloud API credentials from the environment, and proposes no change to the environment or the cluster
- [ ] Three service accounts plan cleanly: one that provisions, one that writes the raw topics, one that only reads the served tables
- [ ] The reader's bindings grant read on both the cluster and the Schema Registry cluster, because a Lightning Table query needs both and either alone is insufficient
- [ ] A Flink compute pool plans with a capped maximum CFU, so the hourly ceiling is explicit
- [ ] Stream Governance is not set to advanced anywhere in the configuration, and a comment records that the upgrade cannot be reversed
- [ ] A variable selects how many raw sources are provisioned, defaulting to three
