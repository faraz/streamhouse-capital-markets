# 12: Deploy to Cloudflare

**What to build:** A stable address the presenter can open from any machine, with every
secret held server-side and a gate in front of it.

The real control is scope, not obscurity: the credential the screen's server layer holds
can only read the two served tables, so a leaked address cannot write, cannot reach other
topics and cannot administer anything.

**Blocked by:** 09, 11.

**Status:** ready-for-agent

- [ ] One command builds and deploys both the screen and its server routes
- [ ] Every secret is set through the platform's secret store, and none is committed
- [ ] A shared secret is checked on every route, and a request without it is refused
- [ ] The reading credential is the minimally scoped one, not the provisioning credential
- [ ] The deployed screen works end to end against live Confluent
- [ ] The deployed screen still works with the live source switched off, falling back to the simulator
- [ ] Per-request processing stays inside the free tier's CPU ceiling, which network waiting does not count against
