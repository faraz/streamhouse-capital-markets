/**
 * The risk agent. Asked a question in English, it works out its own way to the answer
 * against the served Lightning Tables and replies with the figure and how old it is.
 *
 * The engine exposes exactly three tools and there is no mechanism for a purpose-built
 * one, so the agent lists what is there, reads a schema, and writes its own SQL. Showing
 * those real steps is the point: a bespoke endpoint on screen would be the thing a
 * technical counterpart catches.
 *
 * Steps stream to the browser as they happen, so the screen renders the agent thinking
 * rather than a finished transcript.
 */
import Anthropic from '@anthropic-ai/sdk';
import { RtceClient } from './mcp';

const MODEL = 'claude-opus-5-5';

/** Bounded because the engine caps results at 200 rows and 20 seconds anyway. */
const MAX_TURNS = 8;
const MAX_RESULT_ROWS = 200;

const SYSTEM = `You are the risk agent on a capital markets desk. You answer questions about client exposure using only the real-time tables available through your tools.

How to work:
- Call listTopics first to see what is available.
- Call getMetadata on a topic before querying it. Never guess a column name.
- Use the exact column names getMetadata returns, double-quoted in SQL.
- Then call queryData with a SELECT. Always pass max_result_rows.

What you can and cannot do:
- These tables serve one topic at a time. No joins, no GROUP BY, no aggregate functions. Filtering, ORDER BY and LIMIT all work.
- Exposure figures already carry a limit_util_pct column and an as_of column. Use them rather than computing ratios yourself.

How to answer:
- State the figure plainly, then say how old it is: subtract the as_of value from the current time you were given, and say the age in seconds or minutes. The age of the answer matters as much as the answer.
- Round money to whole dollars and percentages to one decimal place.
- If the tables cannot answer the question, say exactly that and say what they do hold. Never estimate, extrapolate or invent a number.
- Two or three sentences. You are speaking to a desk, not writing a report.`;

export interface AgentStep {
  kind: 'tool' | 'result' | 'answer' | 'error';
  tag: string;
  meta?: string;
  code?: string;
  body?: string;
}

export interface AgentDeps {
  anthropicKey: string;
  mcpUrl: string;
  confluentKey: string;
  confluentSecret: string;
}

/**
 * Yields each step as it happens. The caller turns these into an event stream.
 */
export async function* ask(question: string, deps: AgentDeps): AsyncGenerator<AgentStep> {
  const rtce = new RtceClient(deps.mcpUrl, deps.confluentKey, deps.confluentSecret);
  const anthropic = new Anthropic({ apiKey: deps.anthropicKey });

  let mcpTools;
  try {
    // Fetched rather than hardcoded, so the schemas can never drift from the server's.
    mcpTools = await rtce.listTools();
  } catch (e) {
    yield { kind: 'error', tag: 'Engine', body: e instanceof Error ? e.message : String(e) };
    return;
  }

  const tools: Anthropic.Tool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  // The agent has no clock of its own, and "how old is this answer" is the question the
  // whole demo turns on. Without this it correctly refuses to state an age, which is
  // honest and useless. Sent in the user turn rather than the system prompt so the
  // cached prefix survives.
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: `The current time is ${new Date().toISOString()}.` },
        { type: 'text', text: question },
      ],
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Thinking is always on for this model and cannot be disabled; effort is the only
    // control, and its default is one level below what correct SQL on the first attempt
    // deserves in front of a room.
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      output_config: { effort: 'high' },
      // Forced tool choice returns a 400 on this model, so the instruction to call
      // listTopics first lives in the system prompt instead.
      tool_choice: { type: 'auto' },
      tools,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      yield { kind: 'error', tag: 'Declined', body: 'The model declined to answer that.' };
      return;
    }

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        yield { kind: 'answer', tag: 'Answer', body: block.text.trim() };
      }
    }

    if (response.stop_reason !== 'tool_use') return;

    messages.push({ role: 'assistant', content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const args = { ...(block.input as Record<string, unknown>) };
      if (block.name === 'queryData' && !args['max_result_rows']) {
        // Required on every call: omitting it or passing 0 is an error.
        args['max_result_rows'] = MAX_RESULT_ROWS;
      }

      yield {
        kind: 'tool',
        tag: 'Tool call',
        meta: block.name,
        code: typeof args['query'] === 'string' ? (args['query'] as string) : JSON.stringify(args),
      };

      try {
        const out = await rtce.callTool(block.name, args);
        yield { kind: 'result', tag: 'Result', meta: block.name, code: out.slice(0, 1200) };
        results.push({ type: 'tool_result', tool_use_id: block.id, content: out });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        yield { kind: 'error', tag: 'Tool error', meta: block.name, body: msg };
        // Handed back as an error rather than dropped, so the agent can correct itself.
        results.push({ type: 'tool_result', tool_use_id: block.id, content: msg, is_error: true });
      }
    }

    // Every result in one user message: splitting them teaches the model to stop
    // calling tools in parallel.
    messages.push({ role: 'user', content: results });
  }

  yield { kind: 'error', tag: 'Gave up', body: `No answer after ${MAX_TURNS} turns.` };
}
