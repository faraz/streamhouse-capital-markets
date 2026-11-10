# 09: The Worker and the live source

**What to build:** The two tracks join. The screen renders real Confluent data through
the very same interface the simulator implements, and the two are switchable without the
screen knowing which it has.

A small server-side layer holds every credential and exposes one combined route returning
the whole screen's state. No documented support exists for calling the query endpoint
from a browser, so the browser never holds a credential and never calls Confluent
directly.

**Blocked by:** 05, 03.

**Status:** done

- [ ] One route returns the whole screen's state in a single response
- [ ] The live implementation satisfies the same contract suite as the simulator, with the HTTP layer stubbed by recorded responses, and drift between the two fails a test
- [ ] The screen polls that one route, and only while the tab is visible, so the free tier's daily request ceiling is not approached
- [ ] A query returning inline is handled; a query returning the deferred shape does not throw, even before that branch is implemented
- [ ] Every query is written to return at most 200 rows
- [ ] Switching between the simulator and the live source is a single visible control, and the screen says which is in use
- [ ] No credential appears in the browser bundle, in the repository, or in any log
