-- A Lightning Table over a topic that has never had a record reports ACTIVE and refuses
-- queries, so without this the agent's first escalation would be the first record it ever
-- saw. One row for the verification client, dated so long ago that the screen, which shows
-- the last ten minutes, never shows it.
INSERT INTO client_escalations VALUES
  ('90000', TIMESTAMP '2000-01-01 00:00:00', 0.0, 0.0, 100000000.0, 'SETUP', 'Warms the Lightning Table. Never shown.');
