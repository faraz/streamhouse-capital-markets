import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveSource, type WireSnapshot } from '../live';
import { DEFAULT_FILL_LOTS, OPENING_MS, Simulator } from '../simulator';
import { FILL_PX } from '../fill';
import { FOLLOWED } from '../book';
import { runContract } from './contract';

/**
 * The live source, driven through a stub that speaks exactly the wire shape the server
 * route returns. The stub is backed by a simulator, so the assertions are about the
 * ADAPTER: that the wire's fields land in the right places, in the right units, with
 * nothing lost between the two.
 *
 * This is what makes drift between the simulator and the live path a failing test rather
 * than a surprise on stage. A renamed field or a seconds-for-milliseconds slip fails here.
 */
function harness(opts: { viaGlobalFetch?: boolean } = {}) {
  let now = 0;
  const clock = () => now;
  // The server's own view, standing in for Flink and the Lightning Tables.
  const server = new Simulator({ clock, clientCount: 250 });

  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/api/snapshot')) {
      const client = new URL(url, 'http://x').searchParams.get('client') ?? FOLLOWED;
      const s = await server.snapshot(client);
      const wire: WireSnapshot = {
        served: {
          exposureUsd: s.served.exposureUsd,
          limitUsd: s.served.limitUsd,
          limitUtilPct: s.served.limitUtilPct,
          asOfMs: s.served.asOf,
        },
        trueExposureUsd: s.served.exposureUsd,
        book: s.book.map((b) => ({
          clientId: b.clientId,
          exposureUsd: b.exposureUsd,
          limitUsd: b.limitUsd,
          limitUtilPct: b.limitUtilPct,
          asOfMs: b.asOf,
        })),
        active: s.active.map((b) => ({
          clientId: b.clientId,
          exposureUsd: b.exposureUsd,
          limitUsd: b.limitUsd,
          limitUtilPct: b.limitUtilPct,
          asOfMs: b.asOf,
        })),
        recent: s.recent.map((p) => ({
          clientId: p.clientId,
          symbol: p.symbol,
          quantity: p.quantity,
          price: p.price,
          eventTimeMs: p.eventTime,
          source: p.source,
        })),
        rejected: s.rejected ? { raw: s.rejected.raw, reason: s.rejected.reason } : null,
        escalations: s.escalations.map((e) => ({ atMs: e.at, title: e.title, what: e.what, tone: e.tone, author: e.author })),
        activeSources: ['mq_intraday', 'venue', 'book_of_record'],
        normalized: s.normalized,
        servedAgeMs: s.clocks.servedAgeMs,
        openTableAgeMs: s.clocks.openTableAgeMs,
        pendingFill: null,
      };
      return new Response(JSON.stringify(wire), { status: 200 });
    }

    if (url.includes('/api/fill')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      await server.produceFill(body.clientId, body.lots);
      // As the Worker answers: the event it produced, stamped on the server's clock.
      const ts = new Date(OPENING_MS + now).toISOString().replace('T', ' ').replace('Z', '');
      return new Response(JSON.stringify({ produced: { acct: body.clientId, qty: body.lots, ts } }), { status: 200 });
    }
    if (url.includes('/api/reset')) {
      await server.reset();
      return new Response('{}', { status: 200 });
    }
    if (url.includes('/api/fat-finger')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      await server.produceFatFinger(body.clientId);
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;

  if (opts.viaGlobalFetch) {
    // The browser's fetch, as the screen gets it: no fetchFn passed. It throws when called
    // as a method of anything but the window, which is what a stored reference does.
    vi.stubGlobal('fetch', function (this: unknown, ...a: Parameters<typeof fetch>) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return fetchFn(...a);
    });
    const source = new LiveSource({ clock, baseUrl: 'http://x' });
    return { source, advance: (ms: number) => { now += ms; } };
  }

  const source = new LiveSource({ clock, fetchFn, baseUrl: 'http://x' });
  return { source, advance: (ms: number) => { now += ms; } };
}

runContract({
  name: 'live source',
  make: async () => harness(),
  // Isolation is a Flink statement option, not something a query can ask for, so the
  // live path cannot flip it yet. Ticket 14.
  supports: { isolation: false },
});

describe('live source: honesty about where the number came from', () => {
  it('reports confluent as the origin in streamhouse mode', async () => {
    const { source } = harness();
    await source.setMode('streamhouse');
    expect((await source.snapshot(FOLLOWED)).origin).toBe('confluent');
  });

  it('in before mode answers from the overnight copy, and reads what was true from Confluent', async () => {
    // Before is a script: the six legacy systems do not exist in the account. What the room
    // is told was really true, though, is the live served figure, not a simulated one.
    const { source } = harness();
    await source.setMode('streamhouse');
    const live = await source.snapshot(FOLLOWED);
    await source.setMode('before');
    const s = await source.snapshot(FOLLOWED);
    expect(s.origin).toBe('confluent');
    expect(s.served.exposureUsd).toBe(306.2e6);
    expect(s.trueExposureUsd).toBe(live.served.exposureUsd);
  });

  it('labels the next-morning discovery as scripted, not as anyone watching', async () => {
    const { source } = harness();
    await source.setMode('before');
    const [e] = (await source.snapshot(FOLLOWED)).escalations;
    expect(e!.author).toBe('scripted');
    expect(e!.what).toMatch(/103% of limit/);
  });
});

describe('live source: the default fetch, as the browser runs it', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Every other test here injects fetchFn, so the path the screen actually takes went
  // untested and broke in the browser while the whole suite passed.
  it('reaches the server without an injected fetch', async () => {
    const { source } = harness({ viaGlobalFetch: true });
    await source.setMode('streamhouse');
    expect((await source.snapshot(FOLLOWED)).origin).toBe('confluent');
  });
});

describe('live source: a fill in flight is tracked from the live stack, not the simulator', () => {
  // The live book has clients the simulator has never heard of, and the followed client
  // changes as people trade. A fill is pending for the client it was sent to, and only that one.
  it('shows a fill on a client the simulator does not know as pending, priced as the stack prices it', async () => {
    const { source, advance } = harness();
    await source.setMode('streamhouse');
    await source.produceFill('12043', DEFAULT_FILL_LOTS);
    advance(1_000);
    const s = await source.snapshot('12043');
    expect(s.pendingFill?.lots).toBe(DEFAULT_FILL_LOTS);
    expect(s.pendingFill?.notionalUsd).toBe(DEFAULT_FILL_LOTS * FILL_PX);
  });

  it('does not show a fill on 4417 as pending on another client', async () => {
    const { source, advance } = harness();
    await source.setMode('streamhouse');
    await source.produceFill(FOLLOWED, DEFAULT_FILL_LOTS);
    advance(1_000);
    expect((await source.snapshot('12043')).pendingFill).toBeNull();
  });
});
