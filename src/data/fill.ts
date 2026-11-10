/**
 * The presenter's fill, defined once for the live stack, the Worker and the simulator alike.
 *
 * Priced the way every record in this book is: notional is quantity times price, with no
 * contract multiplier, as the seeds are (4417 opens on 67,310 lots at 5,412.25). So say
 * "a twenty-seven million dollar fill" on stage, not the lot count.
 *
 * 5,000 lots at 5,414 is $27.07m. It takes 4417 from 81.4% of its $450m limit to 87.4%: past
 * the 85% escalation line by a clear margin from anywhere it sits, short of the 90% where the
 * book colours a row, and two mistaken extra fills still leave it under 100%. 1,200 lots, the
 * earlier size, reached only 82.8% live and escalated nothing.
 */
export const FILL_LOTS = 5000;
export const FILL_PX = 5414.0;
/** December 2026: the front month in November. September's contract had expired. */
export const FILL_SYMBOL = 'ESZ6';
