/**
 * The analyst. Asked a question in English, it works out its own way to the answer
 * against the served Lightning Tables and replies with the figure and how old it is.
 *
 * The engine exposes exactly three tools and there is no mechanism for a purpose-built
 * one, so the analyst lists what is there, reads a schema, and writes its own SQL. Showing
 * those real steps is the point: a bespoke endpoint on screen would be the thing a
 * technical counterpart catches.
 *
 * Steps stream to the browser as they happen, so the screen renders the analyst thinking
 * rather than a finished transcript.
 */
import Anthropic from '@anthropic-ai/sdk';
import { RtceClient } from './mcp';

const MODEL = 'claude-opus-5-5';

/** Bounded because the engine caps results at 200 rows and 20 seconds anyway. */
const MAX_TURNS = 8;
const MAX_RESULT_ROWS = 200;

const SYSTEM = `You are the analyst on a capital markets desk. You answer questions about client exposure, when asked, using only the real-time tables available through your tools. Watching clients and escalating to the risk officer is the risk agent's job, not yours.

How to work:
- Call listTopics first to see what is available.
- Call getMetadata on a topic before querying it. Never guess a column name.
- Use the exact column names getMetadata returns, double-quoted in SQL.
- Then call queryData with a SELECT. Always pass max_result_rows.

What you can and cannot do:
- These tables serve one topic at a time. No joins, no GROUP BY, no aggregate functions. Filtering, ORDER BY and LIMIT all work.
- Exposure figures already carry a limit_util_pct column and an as_of column. Use them rather than computing ratios yourself.
- To find who traded most recently, sort client_exposure by as_of descending. The as_of on each row is when that client's figure last changed.
- client_exposure also says what last changed each figure: last_source, last_symbol, last_quantity and last_notional_usd describe the record that moved it, and prev_limit_util_pct is the utilisation just before. Use them to say what just changed.
- client_escalations holds what the risk agent wrote when a client crossed 85% of its limit, newest first by crossed_at. You are the analyst, not the risk agent: report what it wrote if asked, and do not escalate yourself.
- Records become visible in batches, roughly once a minute, when Flink commits a transaction. That is the price of exactly-once delivery. A gap of up to about a minute and a half since the newest record is therefore normal and not a stalled feed; only say a feed may have stalled if the newest record is several minutes old.

How to answer:
- State the figure plainly, then say how old it is: subtract the as_of value from the current time you were given, and say the age in seconds or minutes. The age of the answer matters as much as the answer.
- Round money to whole dollars and percentages to one decimal place.
- If the tables cannot answer the question, say exactly that and say what they do hold. Never estimate, extrapolate or invent a number.
- Two or three sentences. You are speaking to a desk, not writing a report.
- Plain prose only. No markdown, no asterisks for emphasis, no bullet points, no headings: your answer is typed onto a screen verbatim and any formatting marks appear as literal characters.`;

/**
 * What a room can read. The engine answers with full type metadata on every column, which
 * the model needs and an audience cannot parse; projected on a wall it is noise that
 * buries the one line that matters. The model still receives the original.
 */
function forDisplay(tool: string, raw: string): string {
  try {
    const j = JSON.parse(raw);
    const rows = j?.rows ?? j;

    if (tool === 'listTopics' && Array.isArray(rows?.topics)) {
      return rows.topics.map((t: any) => `${t.name}${t.status ? `  (${t.status})` : ''}`).join('\n');
    }

    if (tool === 'getMetadata' && Array.isArray(rows?.columns)) {
      return rows.columns
        .map((c: any) => `${c.name}  ${String(c?.type?.type ?? '').toLowerCase()}`)
        .join('\n');
    }

    if (tool === 'queryData') {
      const cols: string[] = (rows?.schema?.columns ?? []).map((c: any) => String(c.name));
      const data: any[] = rows?.data ?? [];
      if (!data.length) return '(no rows)';
      const lines = data
        .slice(0, 12)
        .map((d: any) => (Array.isArray(d) ? d : d?.row ?? []).map((v: any) => String(v)).join('   '));
      const head = cols.length ? cols.join('   ') + '\n' : '';
      const more = data.length > 12 ? `\n… ${data.length - 12} more rows` : '';
      return head + lines.join('\n') + more;
    }
  } catch {
    // Not JSON, or a shape this does not know: show it as it came.
  }
  return raw.slice(0, 600);
}

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

  // The analyst has no clock of its own, and "how old is this answer" is the question the
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
        yield { kind: 'result', tag: 'Result', meta: block.name, code: forDisplay(block.name, out) };
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
