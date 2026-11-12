# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The presenter, driving the demo on their own laptop during a 30 minute seller talk, and the room of Confluent sellers watching it. The presenter needs every beat to land on cue with nothing to hunt for; the sellers need to leave able to tell the story to a capital markets buyer themselves.

## Product Purpose

The demo makes the middle act of the Streamhouse seller deck real, on a live Confluent Cloud stack. Its spine is one question: *what is this client's exposure right now, across everything?* The star is Streamhouse normalizing six real-time feeds into one governed record, then an agent answering questions of it over MCP through the Real-Time Context Engine. The freshness clocks are supporting evidence, never the headline. Success is the room seeing the wrong answer today, then the right answer, with its age, from the live stack.

## Positioning

Nothing on screen is a mock of the product. Streamhouse mode reads the served tables live; Before mode is a script whose "what was really true" is the live figure. The analyst writes its own SQL against a Lightning Table through three generic MCP tools, and the risk agent is a Flink Streaming Agent writing escalations without being asked.

## Operating Context

A nine minute run-of-show of fixed beats (HANDOFF.md): open in Before, the analyst answers from last night's copy, the breach and the false block, flip to Streamhouse, send a fat finger (always client 4417), ask the exposure question live, ask the book question, a fill arrives ($27.07m on 4417) and the risk agent escalates, the price of exactly-once said aloud, then a console cutaway. The presenter rehearses with Reset, never a rebuild. Live events take one Flink commit to land, up to a minute; that wait is the pipeline working and the analyst's answer covers it.

## Capabilities and Constraints

- One data seam: the screen talks to an `ExposureSource` (live or simulator) and nothing else. Polls one combined endpoint every 2 s, only while the tab is visible (Cloudflare free tier).
- The analyst streams steps (ask, tool, result, answer, error) from `/api/ask`; scripted spine questions always work, free text proves it is real.
- Every snapshot and escalation names its origin and author; a fallback changes the label, never passes one writer off as another.
- Labels say Flink guard, not data quality rule (Stream Governance Essentials only).
- Figures are synthetic; no client, venue or custodian is named.
- The prototype `prototype/exposure-desk.html` stays working as the stage fallback (ADR 0002).
- Reduced motion is deliberately answered false: a presenter's own hardware, not a stranger's page.

## Brand Commitments

- Vocabulary from `GLOSSARY.md`: Before mode, Streamhouse mode, the analyst, the risk agent, beat, narrative event, the served tables, the Flink guard.
- Never use em dashes in any copy. Label separators are slashes, not middots.
- No purple, anywhere.
- One colour per concept, and staleness owns its colour exclusively.
- The screen must look like a tool a real brokerage or fintech risk desk would run. Bar: institutional risk systems (Bloomberg, IBKR Risk Navigator), pro trading terminals (Robinhood Legend, Kraken Pro), modern fintech polish (Stripe, Ramp, Mercury) and data platform consoles (Confluent Cloud, Datadog). Themed or metaphorical worlds are out (rejected 2026-11-10).

## Evidence on Hand

A synthetic book of 4,000 clients. The two story clients: 4417 (the breach: last night's copy reads 68%, truly 81%, discovered next morning at 103%; the fill takes it to 87.4%) and 7405 (the false block: the copy reads 98%, the client is at 77%). Six raw source shapes with real sample payloads in `src/data/`. Measured timings in HANDOFF.md.

## Product Principles

- The question first, the machinery after: every beat answers the exposure question or shows why it could not be answered.
- Show the age of every answer; an answer without an age is the problem being sold against.
- Honest about what did the work: name the product capability, the author and the origin on screen.
- The presenter never waits on the UI; the UI may wait on the pipeline, and says so.
