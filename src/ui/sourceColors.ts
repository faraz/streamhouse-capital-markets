import { PALETTE } from './format';

/**
 * A colour for each of the six sources, so a record can be followed by eye from its system's
 * row, down its lane and into Flink. These are identities, not states: the desk's own
 * colours (fresh, near a limit, stale, the agents) keep their meanings, and none of these
 * is one of them. What leaves Flink is one colour, because it is one governed record.
 */
export const SOURCE_COLOR: Record<string, string> = {
  mq_intraday: '#2DD4E6',
  venue: '#F58FC0',
  desk_sheet: '#F2E35B',
  custodial: '#FF9B5E',
  clearing: '#B7E36A',
  book_of_record: '#7CB7FF',
};

/** The trade feed is the live one, and says so in the colour of a fresh answer. */
export const sourceColor = (id: string): string => SOURCE_COLOR[id] ?? (id === 'trade' ? PALETTE.fresh : PALETTE.dim);
