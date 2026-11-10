import { describe, expect, it } from 'vitest';
import type { ExposureSource, Isolation, Mode } from '../types';
import { COMMIT_MS, DEFAULT_FILL_LOTS, MATERIALIZE_MS } from '../simulator';
import { FALSE_BLOCK, FOLLOWED } from '../book';

/**
 * One contract, run against every implementation. The simulator and the live source must
 * agree about what the demo shows, so drift between them fails here rather than on stage.
 *
 * Every assertion is about what an audience sees. None of them knows whether a local
 * function or Flink produced the number.
 */
export interface Harness {
  name: string;
  /** A fresh source, plus the knob that advances its clock. */
  make(): Promise<{ source: ExposureSource; advance(ms: number): void }>;
  /**
   * What this implementation can actually do yet. Declared rather than assumed, so a gap
   * is visible in the test output instead of passing quietly.
   *
   * `isolation`: switching between exactly-once and read-uncommitted. The simulator does
   * it instantly. The live path cannot: on Confluent Cloud the isolation level is a Flink
   * table option on the statement, not a query parameter, so changing it means
   * reconfiguring and restarting the statement. That is ticket 14, not ticket 09.
   */
  supports?: { isolation?: boolean };
}

export function runContract(h: Harness): void {
  const setup = async (mode: Mode = 'streamhouse', iso: Isolation = 'committed') => {
    const { source, advance } = await h.make();
    await source.setMode(mode);
    await source.setIsolation(iso);
    return { source, advance };
  };

  describe(`${h.name}: the before-world`, () => {
    it('inherits the age of the stalest source, not the freshest', async () => {
      const { source } = await setup('before');
      const s = await source.snapshot(FOLLOWED);

      const ages = s.sources.map((x) => x.ageMs);
      const worst = Math.max(...ages);
      const best = Math.min(...ages);

      expect(worst).toBeGreaterThan(best);
      expect(s.clocks.servedAgeMs).toBe(worst);
      expect(s.sources.filter((x) => x.stalest).every((x) => x.ageMs === worst)).toBe(true);
    });

    it('reports the followed client below its true utilisation: the breach', async () => {
      const { source } = await setup('before');
      const s = await source.snapshot(FOLLOWED);
      expect(s.served.exposureUsd).toBeLessThan(s.trueExposureUsd);
    });

    it('reports the mirror client above its true utilisation: the false block', async () => {
      const { source } = await setup('before');
      const s = await source.snapshot(FALSE_BLOCK);
      expect(s.served.exposureUsd).toBeGreaterThan(s.trueExposureUsd);
    });
  });

  describe(`${h.name}: a fill and Flink's commit`, () => {
    it('does not reach the served figure before the next commit', async () => {
      const { source, advance } = await setup();
      const before = await source.snapshot(FOLLOWED);
      await source.produceFill(FOLLOWED, DEFAULT_FILL_LOTS);
      advance(1_000);
      const after = await source.snapshot(FOLLOWED);

      expect(after.served.exposureUsd).toBeCloseTo(before.served.exposureUsd, 0);
      expect(after.pendingFill).not.toBeNull();
      expect(after.trueExposureUsd).toBeGreaterThan(after.served.exposureUsd);
    });

    it('reaches the served figure once the commit has passed', async () => {
      const { source, advance } = await setup();
      const before = await source.snapshot(FOLLOWED);
      await source.produceFill(FOLLOWED, DEFAULT_FILL_LOTS);
      advance(COMMIT_MS + MATERIALIZE_MS + 1_000);
      const after = await source.snapshot(FOLLOWED);

      expect(after.served.exposureUsd).toBeGreaterThan(before.served.exposureUsd);
      expect(after.pendingFill).toBeNull();
    });

    const canSwitchIsolation = h.supports?.isolation !== false;
    it.skipIf(!canSwitchIsolation)('under read-uncommitted reaches the served figure at once, under 100ms old', async () => {
      const { source, advance } = await setup('streamhouse', 'uncommitted');
      const before = await source.snapshot(FOLLOWED);
      await source.produceFill(FOLLOWED, DEFAULT_FILL_LOTS);
      advance(MATERIALIZE_MS + 10);
      const after = await source.snapshot(FOLLOWED);

      expect(after.served.exposureUsd).toBeGreaterThan(before.served.exposureUsd);
      expect(after.clocks.servedAgeMs).toBeLessThanOrEqual(MATERIALIZE_MS);
    });
  });

  describe(`${h.name}: the Flink guard`, () => {
    it('shows the record as rejected and leaves the figure unmoved', async () => {
      const { source, advance } = await setup();
      const before = await source.snapshot(FOLLOWED);
      await source.produceFatFinger(FOLLOWED);
      advance(500);
      const after = await source.snapshot(FOLLOWED);

      expect(after.rejected).not.toBeNull();
      expect(after.rejected!.topic).toBe('positions_dlq');
      expect(after.served.exposureUsd).toBeCloseTo(before.served.exposureUsd, 0);
    });

    it('still leaves it unmoved after a commit has gone by', async () => {
      // Against a control, because baseline jitter legitimately moves the figure over
      // two minutes. The claim is that the fat finger changes nothing, not that nothing
      // changes.
      const treated = await setup();
      const control = await setup();
      await treated.source.produceFatFinger(FOLLOWED);
      treated.advance(COMMIT_MS * 2);
      control.advance(COMMIT_MS * 2);

      const a = await treated.source.snapshot(FOLLOWED);
      const b = await control.source.snapshot(FOLLOWED);
      expect(a.served.exposureUsd).toBe(b.served.exposureUsd);
    });
  });

  describe(`${h.name}: escalation`, () => {
    it('does not escalate without a narrative event', async () => {
      const { source, advance } = await setup();
      advance(COMMIT_MS * 10);
      const s = await source.snapshot(FOLLOWED);
      expect(s.escalations).toHaveLength(0);
    });

    it('escalates exactly once when a fill crosses the threshold', async () => {
      const { source, advance } = await setup();
      // The default fill, which is what the presenter's button produces. It is sized to
      // cross the threshold from anywhere inside the jitter band.
      await source.produceFill(FOLLOWED, DEFAULT_FILL_LOTS);
      advance(COMMIT_MS + MATERIALIZE_MS + 1_000);

      const first = await source.snapshot(FOLLOWED);
      expect(first.served.limitUtilPct).toBeGreaterThanOrEqual(85);
      expect(first.escalations.length).toBe(1);

      advance(COMMIT_MS * 5);
      const later = await source.snapshot(FOLLOWED);
      expect(later.escalations.length).toBe(1);
    });
  });

  describe(`${h.name}: bounded jitter`, () => {
    it('never moves a client across a threshold on its own', async () => {
      const { source, advance } = await setup();
      const thresholds = [85, 90, 100];
      const first = await source.snapshot(FOLLOWED);
      const startBand = thresholds.filter((t) => first.served.limitUtilPct >= t).length;

      for (let i = 0; i < 200; i++) {
        advance(4_000);
        const s = await source.snapshot(FOLLOWED);
        const band = thresholds.filter((t) => s.served.limitUtilPct >= t).length;
        expect(band).toBe(startBand);
      }
    });

    it('keeps every client in the book inside its band over a long run', async () => {
      const { source, advance } = await setup();
      const thresholds = [85, 90, 100];
      const start = new Map(
        (await source.snapshot(FOLLOWED)).book.map((c) => [
          c.clientId,
          thresholds.filter((t) => c.limitUtilPct >= t).length,
        ]),
      );

      for (let i = 0; i < 25; i++) {
        advance(4_000);
        for (const c of (await source.snapshot(FOLLOWED)).book) {
          // Membership of the top rows may change as clients jitter past one another;
          // what must not change is which side of a threshold anyone sits on.
          const was = start.get(c.clientId);
          if (was === undefined) continue;
          const band = thresholds.filter((t) => c.limitUtilPct >= t).length;
          expect(band).toBe(was);
        }
      }
    });
  });

  describe(`${h.name}: the book`, () => {
    it('is sorted by limit utilisation descending and capped at 200 rows', async () => {
      const { source } = await setup();
      const { book } = await source.snapshot(FOLLOWED);

      expect(book.length).toBeGreaterThan(0);
      expect(book.length).toBeLessThanOrEqual(200);
      for (let i = 1; i < book.length; i++) {
        expect(book[i - 1]!.limitUtilPct).toBeGreaterThanOrEqual(book[i]!.limitUtilPct);
      }
    });

    it('carries utilisation and an as-of time as values on every row', async () => {
      const { source } = await setup();
      const { book } = await source.snapshot(FOLLOWED);
      for (const row of book.slice(0, 20)) {
        expect(Number.isFinite(row.limitUtilPct)).toBe(true);
        expect(Number.isFinite(row.asOf)).toBe(true);
        expect(row.limitUsd).toBeGreaterThan(0);
      }
    });
  });

  describe(`${h.name}: someone has always just traded`, () => {
    it('offers recently traded clients, freshest first', async () => {
      const { source } = await setup();
      const { active } = await source.snapshot(FOLLOWED);
      expect(active.length).toBeGreaterThan(0);
      for (let i = 1; i < active.length; i++) {
        expect(active[i - 1]!.asOf).toBeGreaterThanOrEqual(active[i]!.asOf);
      }
    });

    it('answers for a client it has never heard of rather than failing', async () => {
      // After a fall back mid-demo the screen may ask about a live client the simulator
      // does not know. A blank screen is worse than an answer for the followed client.
      const { source } = await setup();
      const s = await source.snapshot('99999');
      expect(s.served.clientId).toBeTruthy();
      expect(Number.isFinite(s.served.exposureUsd)).toBe(true);
    });
  });

  describe(`${h.name}: honesty`, () => {
    it('always states which implementation answered', async () => {
      const { source } = await setup();
      const s = await source.snapshot(FOLLOWED);
      expect(['simulator', 'confluent']).toContain(s.origin);
    });
  });
}
