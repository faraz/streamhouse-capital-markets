# Synthetic sources, not real connectors

Every record in this demo is generated. Nothing connects to a system of record, and there
is no change data capture anywhere, even though the talk this demo supports teaches CDC
reading the book of record as the move that makes the stalest input current.

Managed CDC connectors for Oracle and Postgres are all "Contact us" priced, and
Confluent's own `quickstart-streamhouse` ships no CDC connector at all, so building one
would have meant doing the thing the vendor's reference implementation avoids. The
baseline instead comes from the fully managed Datagen source connector writing into six
raw topics with genuinely divergent schemas, which keeps the normalization story visible
and has the useful side effect of making Connect a real running connector in the console
rather than something asserted.

## Consequences

On screen the position source is named for the topic it writes, `book_of_record.changes`,
rather than claiming a CDC connector. The narrative labels still say change data capture,
because that is what the architecture being taught does, but nothing in the product claims
a feature that is not running.
