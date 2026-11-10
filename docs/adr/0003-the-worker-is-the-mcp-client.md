# The Worker is the MCP client, not Flink

Two agents run in this demo. The streaming one lives in Flink, via `CREATE AGENT` and
`AI_RUN_AGENT` on a Confluent-hosted model, and writes escalations to a topic. The
interactive one, which answers typed questions, runs in a Cloudflare Worker that acts as
an MCP client against the Real-Time Context Engine and calls Anthropic directly.

Flink was the obvious place to put both, since it already hosts the streaming agent. It
was rejected for the interactive path because question-and-answer is request/response
shaped and Flink is stream shaped: driving an interactive exchange through a streaming
statement fights the grain of the tool. Running it in the Worker also means the agent
genuinely talks to RTCE over MCP, which is the point being demonstrated, and the
reasoning can stream onto the screen as it happens.

## Consequences

Needs an Anthropic API key as a Worker secret, separate from anything Confluent issues.
The same MCP endpoint is deliberately left open to other clients, and the run-of-show has
Bob querying it to prove it is an interface rather than a bespoke integration.
