// Emits the chunked Flink statements that seed the book.
//
// Client ids are CONTIGUOUS, 10000 upward. That is what lets the live trade generator
// reach any client: Datagen cannot hold thousands of ids in an options list (its schema
// string caps at 10,000 characters), but it can draw an integer from a range.
//
// Limits are seeded for the whole range; opening balances for only the first part of it.
// The rest have a limit but no position, so each one enters the book the first time it
// trades. That is how the book visibly grows while the demo runs, rather than sitting at
// a fixed size waiting for someone to look at it.
//
// The deck's eight clients are four-digit ids, outside this range, so the generator never
// touches them and they keep the figures the talk states.
//
//   node scripts/generate-book-seed.mjs [limits] [balances]
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

const LIMITS = Number(process.argv[2] ?? 8000);
const BALANCES = Number(process.argv[3] ?? 4000);
const FIRST_ID = 10000;
const CHUNK = 1000;
const OPEN_TS = "TIMESTAMP '2026-11-09 08:00:00'";
const PRICE = 5412.25;
// Capped below the deck's lowest client (5560 at 67.5%), so the eight the talk names
// always head the sorted book, and below the escalation threshold, so nothing crosses a
// line without a narrative event.
const UTIL_MIN = 8;
const UTIL_MAX = 66;

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
const clients = Array.from({ length: LIMITS }, (_, i) => {
  const limitUsd = Math.round((20 + rnd() * 480) * 1e6);
  const util = UTIL_MIN + rnd() * (UTIL_MAX - UTIL_MIN);
  return { id: String(FIRST_ID + i), limitUsd, exposureUsd: (limitUsd * util) / 100 };
});

const out = new URL('../flink/generated/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let nl = 0;
for (let i = 0; i < clients.length; i += CHUNK) {
  nl++;
  const slice = clients.slice(i, i + CHUNK);
  writeFileSync(
    new URL(`book-limits-${nl}.sql`, out),
    'INSERT INTO client_limits VALUES\n' +
      slice.map((c) => `  ('${c.id}', ${c.limitUsd.toFixed(1)})`).join(',\n') + ';\n',
  );
}

let nb = 0;
const funded = clients.slice(0, BALANCES);
for (let i = 0; i < funded.length; i += CHUNK) {
  nb++;
  const slice = funded.slice(i, i + CHUNK);
  writeFileSync(
    new URL(`book-positions-${nb}.sql`, out),
    'INSERT INTO positions VALUES\n' +
      slice
        .map((c) => {
          const qty = Math.max(1, Math.round(c.exposureUsd / PRICE));
          return `  ('${c.id}','OPEN',${qty},${PRICE},${c.exposureUsd.toFixed(1)},${OPEN_TS},'opening_balance',0)`;
        })
        .join(',\n') + ';\n',
  );
}

console.log(`limits for ${LIMITS} clients (${FIRST_ID}-${FIRST_ID + LIMITS - 1}) in ${nl} chunks`);
console.log(`opening balances for ${BALANCES} of them in ${nb} chunks`);
console.log(`the other ${LIMITS - BALANCES} enter the book as they first trade`);
