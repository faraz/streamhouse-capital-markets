# The Streamhouse Capital Markets Demo

A live demo on Confluent Cloud that makes the middle act of the seller talk real: six
differently shaped real-time feeds normalized into one governed record, then an agent
asking questions of it over MCP. This glossary holds only the language this demo
invented. Everything about the architecture and the worked example is inherited.

## Inherited, unchanged

From the seller deck's context (`talks/inference-stack/docs/context/streamhouse-sellers.md`
and `streamhouse.md`), with every definition and avoid-list intact: **the question**,
**exposure**, **the stalest input**, **the age stamp**, **the three clocks**, **the risk
agent**, **the two edges**, **the breach**, **the false block**, **alert red**,
**record**, **topic**, **stream face**, **table face**, **Lightning Table**, **open
table**, **freshness**, **pillar**, **capability**, **the job you own**.

## Language

### The two worlds

**Before mode**:
The demo showing how the question is answered today, from six sources of six ages with no
age stamp on the result.
_Avoid_: legacy mode, old world, baseline

**Streamhouse mode**:
The demo showing the same question answered from one governed record, with an age stamp.
_Avoid_: after, new world, target state

### What moves

**Narrative event**:
A change the presenter causes deliberately, to make a point: the fill that pushes a client
toward its limit, or the fat finger. Never happens on its own.
_Avoid_: trigger, injection, scenario

**Bounded jitter**:
The continuous baseline motion that keeps the screen visibly alive. Stays inside a band,
so no client ever crosses a threshold without a narrative event.
_Avoid_: noise, randomisation, drift

### Who reads the number

**The analyst**:
The agent that answers a question put to it in English, by reading the served tables over
MCP and saying how old its answer is. Acts only when asked. The inherited **risk agent**
is the other one: it watches every client and escalates without being asked.
_Avoid_: the risk agent (that is the watcher), chatbot, assistant, copilot

### What is shown

**Beat**:
One step of the segment, with its own point to make and its own span of seconds.
_Avoid_: step, scene, slide

**Run-of-show**:
The ordered beats of the ten-minute segment.
_Avoid_: script (the script is the words said over it), demo flow, storyboard

**Scripted spine**:
The three fixed questions the presenter drives on stage, which always work. The free-text
box is the proof it is real; the spine is what the segment depends on.
_Avoid_: happy path, golden path

**Console cutaway**:
A deliberate switch out of the demo's own screen into the Confluent Cloud console, to show
that the product rather than the app is doing the work.
_Avoid_: screenshot, screen share

### What it is built from

**Raw topic**:
A topic holding one source's records in the shape that source sent them, with no schema.
Six of them, one per source.
_Avoid_: landing topic, staging topic, bronze

**The served tables**:
`client_exposure` and `positions`, each a topic published as a Lightning Table, and the
only things the frontend and the agent ever read.
_Avoid_: serving layer, mart, view

**The Flink guard**:
The Flink statement that routes a well-formed but wrong record to the dead letter topic.
Does the work that a Schema Registry data quality rule would do on Stream Governance
Advanced, which this demo does not have.
_Avoid_: quality rule (that is the product feature, and naming it that would overclaim),
validator, filter

**The simulator**:
The demo's other data source: a client-side model that answers exactly as the served
tables would, with no network and no Confluent spend. Both the deterministic fallback on
stage and the way the screen stays viewable while the real stack is torn down.
_Avoid_: mock, stub, fixture, offline mode
