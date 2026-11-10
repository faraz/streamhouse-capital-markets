import { describe, expect, it } from 'vitest';
import { num, rowsToObjects } from '../query';

/**
 * Parsing, against the shape the endpoint actually returned on 2026-11-09. Both of these
 * details were discovered live and neither is what a reader of the Avro schema would
 * expect, so they are pinned here.
 */
const REAL_RESPONSE = {
  columns: ['CLIENT_ID', 'EXPOSURE_USD', 'LIMIT_UTIL_PCT'],
  rows: [
    ['2286', '1.1119084E8', '92.65903333333333'],
    ['4417', '3.6559958E8', '81.24435111111111'],
  ],
};

describe('query parsing', () => {
  it('reads columns case-insensitively, because the endpoint uppercases them', () => {
    // The Avro schema declares client_id; the response names it CLIENT_ID.
    const objs = rowsToObjects(REAL_RESPONSE);
    expect(objs[0]!['CLIENT_ID']).toBe('2286');
    expect(rowsToObjects({ ...REAL_RESPONSE, columns: ['client_id', 'exposure_usd', 'limit_util_pct'] })[0]!['CLIENT_ID']).toBe('2286');
  });

  it('parses scientific notation, because every value arrives as a string', () => {
    expect(num('3.6559958E8')).toBeCloseTo(365_599_580, 0);
    expect(num('1.1119084E8')).toBeCloseTo(111_190_840, 0);
    expect(num('92.65903333333333')).toBeCloseTo(92.659, 3);
  });

  it('treats a missing or empty value as zero rather than NaN', () => {
    expect(num(undefined)).toBe(0);
    expect(num('')).toBe(0);
    expect(num('not a number')).toBe(0);
  });

  it('keeps the exposure figure intact through a full round trip', () => {
    const objs = rowsToObjects(REAL_RESPONSE);
    const row = objs.find((o) => o['CLIENT_ID'] === '4417')!;
    expect(num(row['EXPOSURE_USD'])).toBeCloseTo(365_599_580, 0);
    expect(num(row['LIMIT_UTIL_PCT'])).toBeCloseTo(81.244, 3);
  });
});
