-- The book as it stood at the open. These carry the existing exposure the deck states,
-- so the running total in client_exposure is a genuine sum rather than a number conjured
-- from nowhere.
--
-- Seeded straight into positions rather than through a raw topic, and named
-- 'opening_balance' on every row, because that is what they are: the state before
-- today's feed, which did not arrive on today's feed. Nothing here pretends otherwise.
INSERT INTO positions VALUES
  ('2286','OPEN', 20843, 5412.25, 112800000.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0),
  ('8803','OPEN', 50164, 5412.25, 271500000.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0),
  ('6154','OPEN', 39910, 5412.25, 216000000.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0),
  ('4417','OPEN', 67310, 5412.25, 364300640.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0),
  ('7405','OPEN', 11381, 5412.25,  61600000.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0),
  ('9021','OPEN', 68549, 5412.25, 371000000.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0),
  ('3318','OPEN', 26087, 5412.25, 141200000.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0),
  ('5560','OPEN', 18717, 5412.25, 101300000.0, TIMESTAMP '2026-11-09 08:00:00', 'opening_balance', 0);
