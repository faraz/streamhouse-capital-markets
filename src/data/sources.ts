/**
 * Six systems, six shapes, six ages. Only one carries a time, and that is the point:
 * reconciling these is the work Connect and Flink are shown doing.
 *
 * Ages are at the demo's opening instant and climb with the simulated day, except the
 * intraday feed, which is always current, and the book of record once it is read at
 * source rather than waiting for a nightly extract.
 */
export interface SourceDef {
  name: string;
  shape: string;
  raw: string;
  /** Age in seconds when the demo opens. */
  openingAgeSec: number;
  /** True for the source that change data capture makes current in Streamhouse mode. */
  becomesLive: boolean;
}

export const SOURCES: ReadonlyArray<SourceDef> = [
  {
    name: 'Intraday feed',
    shape: 'Messages on MQ',
    raw: 'MSG|ACCT=4417|SYM=ESU6|QTY=+240|PX=5412.25|TS=14:06:19',
    openingAgeSec: 2,
    becomesLive: false,
  },
  {
    name: 'Venue',
    shape: 'Loose fields, no time',
    raw: '{"acct":"4417","sym":"ESU6","q":240,"p":5412.25}',
    openingAgeSec: 7560, // reconciles at noon
    becomesLive: false,
  },
  {
    name: 'Desk spreadsheet',
    shape: 'Typed cells',
    raw: '4417,ESU6,240,5412.25',
    openingAgeSec: 11400,
    becomesLive: false,
  },
  {
    name: 'Custodial file',
    shape: 'Fixed-width columns',
    raw: '4417      ESU6      000240  005412250',
    openingAgeSec: 29160, // landed at 06:00
    becomesLive: false,
  },
  {
    name: 'Clearing statement',
    shape: 'Printed total',
    raw: 'TOTAL DUE        364,300,640.00',
    openingAgeSec: 93600, // yesterday
    becomesLive: false,
  },
  {
    name: 'Position file',
    shape: 'Nightly extract / mainframe',
    raw: '4417|ESU6|240|5412.25|2026-11-08T22:00:00',
    openingAgeSec: 57960, // last night's close
    becomesLive: true,
  },
];

/** What the position file becomes once it is read at its source. */
export const LIVE_BOOK_OF_RECORD = {
  shape: 'Change data capture / mainframe',
  raw: '4417|ESU6|240|5412.25|INSERT|2026-11-09T14:06:19',
  ageSec: 3,
};
