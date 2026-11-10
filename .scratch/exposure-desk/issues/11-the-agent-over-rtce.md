# 11: The agent over RTCE

**What to build:** The star of the demo. An agent that is asked a question in English,
works out its own way to the answer against the served tables, and replies with the figure
and how old it is.

The serving engine exposes exactly three generic tools and there is no way to add a
purpose-built one, so the agent lists what is there, inspects a schema and writes its own
SQL. Showing those real steps is the credibility move: a bespoke endpoint on screen would
be the thing a technical counterpart catches.

The interactive path runs server-side rather than inside the stream processor, because
question and answer is request-response shaped.

**Blocked by:** 05.

**Status:** done

- [ ] The three scripted questions each return a correct answer drawn from a real query
- [ ] The free-text box answers questions that were not scripted, grounded only in the served tables, and declines anything it cannot answer from them rather than improvising
- [ ] The agent's steps appear on screen as they happen: the tools it calls and the SQL it wrote
- [ ] No tool name on screen is invented; only the three the engine actually exposes appear
- [ ] Every answer carries the age of the figure it is built on
- [ ] Asked the exposure question in Before mode, the agent answers confidently and wrongly, and the screen then shows what was true and that nothing was escalated
- [ ] Results are bounded to 200 rows and 20 seconds, which the agent's interface enforces
