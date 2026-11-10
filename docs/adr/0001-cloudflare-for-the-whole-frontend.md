# Cloudflare, not Vercel, for the whole frontend

Vercel was the first choice, on the reasoning that its Node runtime could run a Kafka
client with Schema Registry. That reasoning turned out to be void: the frontend never
speaks the Kafka protocol, because reading goes over HTTPS to the Lightning Tables SQL
endpoint and writing goes over HTTPS to the Kafka REST produce API. With no need for a
Node runtime, Cloudflare wins on the axes that remain: cron triggers at about one minute
against Vercel Hobby's fifteen, one platform instead of two, and a free tier the author
already uses. Vercel Hobby is also documented as non-commercial personal use only, which
would have been a problem for a seller demo.

## Consequences

Workers cap CPU at 10ms per request on the free plan, though time waiting on network I/O
does not count, so a route that forwards a query and returns a small result set fits
comfortably. The 100,000 requests per day ceiling is why the screen polls one combined
endpoint and only while the tab is visible, rather than several endpoints continuously.
