-- A client that exists only to be verified against. Outside the trade feed's range
-- (10000-17999) and not one of the deck's eight, so nothing else ever writes to it and a
-- produced record's effect on its exposure can be asserted exactly. Every other client
-- can be touched by the trade feed mid-test, which would make an exact assertion flaky.
INSERT INTO client_limits VALUES ('90000', 100000000.0);
