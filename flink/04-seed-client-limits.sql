-- The eight clients the deck names, with the limits it states. Ticket 08 extends this to
-- four thousand; this is the narrow path.
--
-- INSERT ... VALUES materializes as a bounded source in any Flink dialect, which is
-- exactly right for a one-shot seed and wrong for anything continuous. Flink also
-- handles the Avro key encoding, which producing by hand would not.
INSERT INTO client_limits VALUES
  ('2286', 120000000.0),
  ('8803', 300000000.0),
  ('6154', 250000000.0),
  ('4417', 450000000.0),
  ('7405',  80000000.0),
  ('9021', 500000000.0),
  ('3318', 200000000.0),
  ('5560', 150000000.0);
