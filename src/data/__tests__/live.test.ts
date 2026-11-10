import { describe, expect, it } from 'vitest';
import { LiveSource, type WireSnapshot } from '../live';
import { Simulator } from '../simulator';
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
function harness() {
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
        escalations: s.escalations.map((e) => ({ atMs: e.at, who: e.who, what: e.what, tone: e.tone })),
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
      return new Response('{}', { status: 200 });
    }
    if (url.includes('/api/fat-finger')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      await server.produceFatFinger(body.clientId);
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;

  const source = new LiveSource({ clock, fetchFn, clientCount: 250, baseUrl: 'http://x' });
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

  it('reports simulator as the origin in before mode, because nothing is queried', async () => {
    const { source } = harness();
    await source.setMode('before');
    expect((await source.snapshot(FOLLOWED)).origin).toBe('simulator');
  });

  it('never calls the network in before mode', async () => {
    let calls = 0;
    let now = 0;
    const fetchFn = (async () => { calls++; return new Response('{}', { status: 500 }); }) as unknown as typeof fetch;
    const source = new LiveSource({ clock: () => now, fetchFn, clientCount: 50, baseUrl: 'http://x' });
    await source.setMode('before');
    await source.snapshot(FOLLOWED);
    expect(calls).toBe(0);
  });
});
