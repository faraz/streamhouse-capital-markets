// Emits the chunked Flink statements that seed the book to its full size.
//
// Chunked because one INSERT ... VALUES with four thousand rows is roughly 200KB of SQL.
// Bounded sources, so each statement completes rather than running forever.
//
// Generated utilisation is capped below the deck's lowest client, so the eight clients
// the talk names always sit at the top of the sorted book, and below the escalation
// threshold, so nothing crosses a line without a narrative event.
import { writeFileSync, mkdirSync } from 'node:fs';
import { DECK_CLIENTS } from '../src/data/book.ts';

const TOTAL = Number(process.argv[2] ?? 4000);
const CHUNK = 1000;
const OPEN_TS = "TIMESTAMP '2026-11-09 08:00:00'";
const PRICE = 5412.25;
const UTIL_MIN = 8;
const UTIL_MAX = 66; // 5560, the deck's lowest, sits at 67.5

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(4417);
const taken = new Set(DECK_CLIENTS.map((c) => c.id));
const rows = [];
while (rows.length + DECK_CLIENTS.length < TOTAL) {
  const id = String(10000 + Math.floor(rnd() * 89999));
  if (taken.has(id)) continue;
  taken.add(id);
  const limitUsd = Math.round((20 + rnd() * 480) * 1e6);
  const util = UTIL_MIN + rnd() * (UTIL_MAX - UTIL_MIN);
  const exposureUsd = (limitUsd * util) / 100;
  rows.push({ id, limitUsd, exposureUsd });
}

mkdirSync(new URL('../flink/generated/', import.meta.url), { recursive: true });
let n = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const slice = rows.slice(i, i + CHUNK);
  n++;

  writeFileSync(
    new URL(`../flink/generated/book-limits-${n}.sql`, import.meta.url),
    `INSERT INTO client_limits VALUES\n` +
      slice.map((r) => `  ('${r.id}', ${r.limitUsd.toFixed(1)})`).join(',\n') + ';\n',
  );

  writeFileSync(
    new URL(`../flink/generated/book-positions-${n}.sql`, import.meta.url),
    `INSERT INTO positions VALUES\n` +
      slice
        .map((r) => {
          const qty = Math.max(1, Math.round(r.exposureUsd / PRICE));
          return `  ('${r.id}','OPEN',${qty},${PRICE},${r.exposureUsd.toFixed(1)},${OPEN_TS},'opening_balance',0)`;
        })
        .join(',\n') + ';\n',
  );
}

console.log(`${rows.length} generated clients + ${DECK_CLIENTS.length} from the deck = ${rows.length + DECK_CLIENTS.length}`);
console.log(`${n} chunks of up to ${CHUNK}`);
