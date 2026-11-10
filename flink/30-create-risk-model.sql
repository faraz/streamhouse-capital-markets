-- The model the risk agent thinks with: Claude, hosted by Confluent, so there is no API key
-- and no connection to hold one. Chosen from SHOW MODELS in us-east-1 on 2026-11-10, which
-- listed Sonnet 4.6, Opus 4.6, 4.7 and 4.8, and Haiku 4.5: Opus 4.8 is the newest, and on a
-- crossing it wrote the cleaner note, in 13 s against Sonnet's 16 s.
CREATE MODEL risk_model
INPUT (prompt STRING)
OUTPUT (response STRING)
WITH (
  'provider' = 'confluent',
  'task' = 'text_generation',
  'confluent.model' = 'anthropic.claude-opus-4-8',
  'confluent.input_format' = 'confluent-chat',
  'confluent.params.max_tokens' = '1024'
);
