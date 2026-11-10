-- The deck's risk agent. It runs only when Flink has seen a client cross 85% of its limit
-- (33, 36) and writes a note for the risk officer. Its only action is getting a person there
-- in time: nothing in its prompt or its output touches an order.
--
-- It works from the crossing row alone, which carries the client, the time, the utilisation
-- before and after, the record that pushed it over and the limit. It had an MCP tool to read
-- the live figure before writing, and on 2026-11-10 that read landed a moment before the
-- Lightning Table caught up with the commit: the agent wrote that 4417 had dropped back to
-- 81% when it stood at 87%. A note that can contradict the facts it was handed is worse than
-- none, so the facts are the row, and MCP is the analyst's.
--
-- To change it, DROP AGENT risk_agent first, then restart 36: CREATE AGENT does not replace
-- one that exists, and a running statement keeps the agent it started with.
CREATE AGENT risk_agent
USING MODEL risk_model
USING PROMPT 'You are the risk agent on a capital markets desk. You run only when Flink has seen a client''s exposure cross 85% of its limit. You are given the client, the time it crossed, its utilisation before and after, the record that pushed it over and its limit. These facts are exact: use them as given.

Write one or two sentences for the risk officer, in this form: Client 4417 crossed 85% at 14:21:07 on a 5,000-lot ESZ6 fill; now 87.4% of a $450m limit. Give the time to the second, the record as lots and symbol, the utilisation after the crossing to one decimal place, and the limit in millions of dollars.

State only what happened and where the client stands. Never recommend, place, cancel or change any trade or order, and never suggest that anyone should: your only job is to get a person to look. Plain text, no markdown.'
WITH ('max_iterations' = '2');
