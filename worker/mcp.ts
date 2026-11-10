/**
 * A minimal MCP client for the Real-Time Context Engine, over streamable HTTP.
 *
 * Two things about this server are worth knowing. It answers JSON-RPC without requiring
 * the initialize handshake first, verified live. And it replies as server-sent events
 * (`event: message` then `data: {...}`) rather than plain JSON, so the body has to be
 * unwrapped before parsing.
 *
 * Authentication is HTTP Basic with a Global API key. A Cloud API key manages resources;
 * only a Global key queries them.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class McpError extends Error {}

export class RtceClient {
  private id = 0;

  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly secret: string,
  ) {}

  private async rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Both, because the server may answer either way.
        Accept: 'application/json, text/event-stream',
        Authorization: `Basic ${btoa(`${this.key}:${this.secret}`)}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
    });

    const text = await res.text();
    if (!res.ok) throw new McpError(`${method} failed: ${res.status} ${text.slice(0, 300)}`);

    const payload = parseMaybeSse(text);
    if (payload?.error) {
      throw new McpError(`${method}: ${payload.error.message ?? JSON.stringify(payload.error)}`);
    }
    return payload?.result;
  }

  async listTools(): Promise<McpTool[]> {
    const r = await this.rpc('tools/list');
    return (r?.tools ?? []) as McpTool[];
  }

  /** Returns the tool's text content, which is what the model needs to read. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const r = await this.rpc('tools/call', { name, arguments: args });
    const parts: string[] = (r?.content ?? [])
      .map((c: any) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c)))
      .filter(Boolean);
    const body = parts.join('\n').trim();
    if (r?.isError) throw new McpError(body || `${name} returned an error`);
    return body || '(no rows)';
  }
}

/** The body is either plain JSON or SSE frames. Take the last data frame either way. */
function parseMaybeSse(text: string): any {
  const t = text.trim();
  if (t.startsWith('{')) return JSON.parse(t);

  let last: any = null;
  for (const line of t.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      last = JSON.parse(data);
    } catch {
      // A partial frame is not fatal: keep whatever last parsed cleanly.
    }
  }
  if (!last) throw new McpError(`could not parse response: ${t.slice(0, 300)}`);
  return last;
}
