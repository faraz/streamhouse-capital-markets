# 02: Spike: prove direct Lightning Table querying on this account

**What to build:** Settle a documented contradiction before anything depends on it. One
Confluent page calls issuing a Lightning Table query yourself, without an agent, an Early
Access feature; the API reference and the GA release note both contradict it. This is the
only documented reason a direct query might be refused on a fresh account, and the answer
changes the design of the live source and the screen's polling.

Enable a Lightning Table on a throwaway topic that has a registered schema, then query it
both from the command line and over HTTP.

**Blocked by:** 01.

**Status:** done

- [ ] A throwaway topic with a registered schema has a Lightning Table that reaches status Active
- [ ] A query returns rows through the CLI
- [ ] A query returns rows through the HTTP query endpoint using a **Global** API key, which is a different credential from the Cloud key that manages resources
- [ ] If it is refused, the status code and response body are recorded verbatim, and the spec's live-source design is amended before any other ticket begins
- [ ] The finding is written into the research notes with the date
- [ ] The throwaway topic and its Lightning Table are removed
