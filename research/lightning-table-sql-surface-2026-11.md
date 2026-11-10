# Lightning Table SQL surface, limits, auth — primary-source research

Researched 2026-11-09. Sources: `docs.confluent.io` only (Confluent Cloud docs, the
Confluent Cloud API reference, and the Confluent Cloud release notes), plus
`vercel.com/docs` for question 7. Every claim carries a source URL. Anything the docs
do not state is labelled **UNCONFIRMED**.

Taken as given from prior research and not re-litigated here: GA and self-serve,
AWS-only, `us-east-1`, Basic clusters qualify, ~100 ms freshness, single-topic,
read-only, `/query/v1` endpoint, `confluent_rtce_topic` Terraform resource. Several of
these were independently re-confirmed in passing and are noted where they were.

---

## Bottom line

**Yes. A sorted top-N query over a few thousand rows works on a Lightning Table
directly, and Confluent's own API documentation ships that exact query shape as a
worked example. Flink does not need to precompute a ranked topic.**

The documented example is literally "filter on a non-key column, sort descending on a
non-key column, take the top 10":

```sql
SELECT ORDER_ID, STATUS, TOTAL FROM orders_topic
WHERE STATUS = 'completed' AND TOTAL > 100
ORDER BY TOTAL DESC
LIMIT 10
```

— [Query a Lightning Table with the API](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html) (under "Filter and sort results"), and again in
[Query a Lightning Table with MCP](https://docs.confluent.io/cloud/current/lightning-tables/query/mcp.html), which lists "What are the top 10 highest-value
completed orders?" as a supported natural-language request and shows the SQL it
produces.

The ranking `top N clients by limit utilisation` needs is a sort on a stored column.
Three qualifications, in order of how likely they are to bite:

1. **If `utilisation` is a ratio you want the database to compute** (`a / b AS
   ratio`), that is **UNCONFIRMED**. The SQL reference enumerates supported
   capabilities and arbitrary expressions in the projection is not among them; there
   is no functions or operators reference for Lightning Tables at all. Store the
   ratio as a materialised column in the topic, or compute it client-side after
   fetching a few thousand rows. Do not build on `ORDER BY a / b`.
2. **`OFFSET` is nowhere in the Lightning Tables documentation.** No pagination.
   Top-N yes; page 3 of N, UNCONFIRMED.
3. **Route matters.** Over the HTTP API a query has no documented row limit; over MCP
   it is hard-capped at 200 rows and a 20-second timeout. A few thousand rows is
   comfortably inside the API's documented behaviour and well under the 4 MiB
   inline-response threshold if the projection is narrow.

The one thing that should give pause before building is **question 5**: the RTCE
billing page still calls direct API querying an Early Access Program feature, "not for
production use", while the release notes and the GA availability table say otherwise.
That contradiction is live on the docs site as of today and is unresolved by the docs
themselves.

---

## 1. The exact SQL surface

Primary source: [SQL Reference for Lightning Table Queries in Confluent Cloud](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)

The page opens: "A Lightning Table query runs read-only SQL on a single Lightning
Table. The same SQL applies whether you query in the Confluent Cloud Console, through
an HTTP API, with a Model Context Protocol (MCP) client, with the Confluent CLI, or
with a Java Database Connectivity (JDBC) client." The SQL surface is therefore
interface-independent; only the *limits* vary by interface.

### Supported, quoted verbatim

> A Lightning Table query supports the following SQL capabilities:
>
> - **Key lookups**: Look up rows by primary key value.
> - **Filters**: Narrow results in the `WHERE` clause by using the following
>   operators: equality (`=`), inequality (`!=`), comparison (`>`, `<`, `>=`, `<=`),
>   set membership (`IN`, `NOT IN`), null checks (`IS NULL`, `IS NOT NULL`), pattern
>   matching (`LIKE`, `NOT LIKE`), and range (`BETWEEN`).
> - **Compound predicates**: Combine multiple conditions with the `AND` and `OR`
>   operators.
> - **Column selection**: Select specific columns to reduce the response size, or
>   select all columns.
> - **Ordering**: Sort results in ascending or descending order with the `ORDER BY`
>   clause.
> - **Row limits**: Control the number of rows returned with the `LIMIT` clause.

### Unsupported, quoted verbatim

> A Lightning Table query is read-only. It doesn't support the following operations:
>
> - Aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`)
> - `GROUP BY` clauses
> - Joins
> - Subqueries
> - Set operators (`UNION`, `EXCEPT`, `INTERSECT`)
> - DDL statements (`CREATE`, `ALTER`, `DROP`)
> - DML statements (`INSERT`, `UPDATE`, `DELETE`)
>
> Confluent Cloud rejects an unsupported query without running it.

Note that last sentence: rejection is pre-execution, so an unsupported query fails
fast rather than running up a scan bill.

The reference's own worked example, verbatim:

```sql
SELECT ORDERID, ITEMID, ORDERUNITS
FROM `orders`
WHERE ORDERUNITS > 5
ORDER BY ORDERTIME DESC
LIMIT 10;
```

Observe that this sorts on `ORDERTIME`, a column that is **not in the projection** —
so `ORDER BY` is not restricted to selected columns.

### Item-by-item verdict

| Feature | Verdict | Basis |
|---|---|---|
| `SELECT` with a projection list | **Supported** | "Column selection: Select specific columns to reduce the response size, or select all columns" ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)) |
| Arbitrary expressions in the projection (`a / b AS ratio`) | **UNCONFIRMED** | Not listed among supported capabilities; no functions/operators reference exists for Lightning Tables. Column *aliasing* alone is confirmed: the CLI page instructs "Rename one of the columns with the `AS` keyword, as in `SELECT KEY AS ORDER_KEY`" ([cli](https://docs.confluent.io/cloud/current/lightning-tables/query/cli.html)). An alias is not an expression. Treat computed projections as unsupported until tested. |
| `WHERE` on the key | **Supported** | "Key lookups: Look up rows by primary key value" ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)) |
| `WHERE` on a non-key column | **Supported** | The reference's own example filters `WHERE ORDERUNITS > 5`; the API page's example filters `WHERE STATUS = 'completed' AND TOTAL > 100` ([api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html)). Neither column is a key. |
| `ORDER BY` on a stored column | **Supported** | "Ordering: Sort results in ascending or descending order with the `ORDER BY` clause"; example sorts `ORDER BY ORDERTIME DESC` ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)) |
| `ORDER BY` on a computed expression | **UNCONFIRMED** | Same gap as computed projections. Every documented `ORDER BY` names a bare column. |
| `LIMIT` | **Supported** | "Row limits: Control the number of rows returned with the `LIMIT` clause" ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)) |
| `OFFSET` | **UNCONFIRMED — absent** | The string `OFFSET` appears nowhere in any Lightning Tables documentation page: not in the supported list, not in the unsupported list, not in any example. No documented pagination mechanism. |
| `COUNT(*)` | **NOT supported** | "Aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`)" are named in the unsupported list ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)) |
| `GROUP BY` | **NOT supported** | Named in the unsupported list |
| `JOIN` | **NOT supported** | "Joins" named in the unsupported list |
| Subqueries | **NOT supported** | "Subqueries" named in the unsupported list |
| `LIKE` | **Supported** | "pattern matching (`LIKE`, `NOT LIKE`)" ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)) |
| `IN` | **Supported** | "set membership (`IN`, `NOT IN`)" |
| Range predicates on non-key columns | **Supported** | "comparison (`>`, `<`, `>=`, `<=`) … and range (`BETWEEN`)". The reference lists these as `WHERE`-clause capabilities with no key/non-key distinction, and demonstrates `WHERE ORDERUNITS > 5` on a non-key column. The query overview page separately describes the workload as "point lookups, range scans, and full scans" ([query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html)). |

Also supported, beyond the question list: `SHOW TABLES` and `DESCRIBE`. "This endpoint
exposes a single operation. To list topics or describe a schema, use the `SHOW TABLES`
or `DESCRIBE` statement in the same request." ([api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html))

### Topic-name quoting, and one inconsistency

> If a topic name contains any character other than letters and numbers, enclose it in
> backticks, as in the statement `SELECT * FROM `web-orders` LIMIT 10;`. Quoted names
> are case sensitive, but unquoted names aren't.

— [sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html), repeated on the [api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html), [cli](https://docs.confluent.io/cloud/current/lightning-tables/query/cli.html) and [jdbc](https://docs.confluent.io/cloud/current/lightning-tables/query/jdbc.html) pages.

**Inconsistency worth knowing before you build a query builder:** the prose docs use
backticks throughout, but the OpenAPI reference's own examples use double quotes —
`SELECT l_orderkey, l_quantity, l_description FROM "order" LIMIT 5` ([Execute SQL
Statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/)). `order` is a reserved word, which may explain the
different quoting style, but the docs never state which identifier-quoting characters
are accepted. **UNCONFIRMED** whether double quotes work generally. Use backticks:
that is what the prose reference prescribes.

### Supported data types (relevant to whether your rows can be materialised at all)

Numeric `TINYINT`, `SMALLINT`, `INT`, `BIGINT`, `FLOAT`, `DOUBLE`, `DECIMAL`;
`BOOLEAN`; `CHAR`, `VARCHAR`, `BINARY`, `VARBINARY`; `DATE`, `TIME` (precision 0
only), `TIMESTAMP` (precision 0 to 6), `TIMESTAMP_LTZ` (precision 0 to 6); `ARRAY`,
`MAP` ("except `MAP` types with nullable non-character keys"), `ROW`.

Not supported: `INTERVAL YEAR TO MONTH`, `INTERVAL DAY TO SECOND`, `MULTISET`,
`TIMESTAMP WITH TIME ZONE`, `RAW`. "If your topic schema uses an unsupported data
type, you can't enable a Lightning Table for that topic." ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html))

`DECIMAL` being supported matters for a limit-utilisation figure: you can store the
ratio as `DECIMAL(10,4)` rather than computing it in SQL.

---

## 2. The point-lookup idiom

**The premise in the question is not what the docs show.** There is no documented
`WHERE "KEY" = '<value>'` form. The documented point lookup filters on **the schema's
own column name, unquoted**.

The API page's example, verbatim, under the heading "Look up a single order by key":

```bash
curl -X POST \
  https://sql.us-west-2.aws.confluent.cloud/query/v1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $TOKEN" \
  -d '{
    "catalog_name": "env-abc123",
    "database_name": "lkc-abc123",
    "query": "SELECT * FROM orders_topic WHERE ORDER_ID = '\''ORD-4521'\''"
  }'
```

— [Query a Lightning Table with the API](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html)

So: `WHERE ORDER_ID = 'ORD-4521'`. Column name bare and uppercase, string literal in
single quotes, topic name bare. The MCP page corroborates with "Look up order
ORD-4521." as the natural-language form of the same request ([mcp](https://docs.confluent.io/cloud/current/lightning-tables/query/mcp.html)).

### What the key column is actually called

**Partly UNCONFIRMED, and this is the one genuine gap in an otherwise complete doc
set.** Three things the docs do establish:

1. **When the key has a schema, its fields are ordinary named columns** and you filter
   on them by name, as `ORDER_ID` above. The upsert requirements say the record key
   "can be raw bytes, or it can use a schema in Avro, Protobuf, or JSON Schema format"
   ([limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html)).
2. **A `KEY` column does exist, unquoted and uppercase.** The only appearance in the
   whole doc set is incidental, in the CLI page's note about duplicate column names in
   JSON output: "Rename one of the columns with the `AS` keyword, as in `SELECT KEY AS
   ORDER_KEY`." ([cli](https://docs.confluent.io/cloud/current/lightning-tables/query/cli.html)). Plain `KEY`, no quoting. This is consistent with
   `KEY` being the column for a raw-bytes record key, but **the docs never say so**
   and never show `WHERE KEY = ...`. **UNCONFIRMED.**
3. **The reliable way to find out is to ask the table.** Run `DESCRIBE <topic>` — it
   "Returns one row per column" ([Execute SQL Statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/)) — or, over MCP, `getMetadata`,
   whose "response includes column names, data types, and primary key information for
   the topic" ([mcp](https://docs.confluent.io/cloud/current/lightning-tables/query/mcp.html)). The MCP page makes this mandatory practice: "The agent should
   call the `getMetadata` tool before the `queryData` tool to prevent errors from
   incorrect column names or types."

**Build recommendation:** give the demo topic a *schemafied* key, so the key field is
a named column and you are on the documented path (`WHERE CLIENT_ID = '...'`). Then
run `DESCRIBE` once against the real table and pin the column names before writing any
query strings. Do not code against `"KEY"` with double quotes — that form appears
nowhere in the documentation.

---

## 3. Scale and limits

### How many rows a Lightning Table can hold

**UNCONFIRMED. No row-count ceiling is documented anywhere.** Capacity is described in
bytes, not rows, and only through the billing unit: one CCU covers "a hot memory size
supporting roughly 40 GB of base storage" ([Real-Time Context Engine Billing](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html)).
That is a billing threshold, not a cap — more data means more CCUs, not rejection. The
[service quotas](https://docs.confluent.io/cloud/current/quotas/overview.html) page does not mention Lightning Tables or RTCE at all. A few
thousand rows is not in the same universe as any of this.

Separately, a Lightning Table outlives the topic's retention: "The Lightning Table
persists independently of the topic's retention policy. As a result, a Lightning Table
query can return data that has already aged out of the topic." ([query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html))

### Limits by interface

The SQL reference defers: "Limits, such as the maximum number of rows a query returns,
depend on the query interface." ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html))

| | Max rows | Timeout | Notes |
|---|---|---|---|
| **HTTP API** | "no row limit" (prose) — **but see the conflict below** | Not stated as a hard timeout; 10 s is the inline/async switch | Result has an unstated max size |
| **MCP** | **200** | **20 s** | `max_result_rows` required on every call |
| **CLI** | 100 printed by default; `--max-rows 0` for no limit | **2 minutes** including retries | ~1 MB max statement size |
| **JDBC** | Not stated | Not stated | Oversized result fails outright |
| **Console** | Prefilled query uses `LIMIT 100` | Not stated | |

**API, verbatim:** "A Lightning Table query that you run through the API has no row
limit. The MCP tools have their own row limit." And: "A query result has a maximum
size. If a result exceeds it, the job fails. To reduce the result size, add a `LIMIT`
clause or a narrower filter to your query." The maximum size is **never given a
number** in prose — **UNCONFIRMED**. ([api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html))

**⚠️ A documented conflict on `max_result_rows`.** The prose says the parameter is
"Optional. The maximum number of rows to return. Use it to limit the size of a
response. **If you omit it, the API returns all rows.**" ([api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html)). The OpenAPI
reference for the same field says:

> `max_result_rows`: `type: integer`, `format: int32`, `minimum: 1`, `maximum: 200` —
> "Maximum rows to return inline, up to 200."

— [Execute SQL Statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/)

Both pages are current. The consistent reading is that the *parameter value* is
constrained to 1–200 while *omitting* it is unbounded, but the schema constraint is
not labelled as applying only to the inline path and the prose does not acknowledge
any cap. **Treat "can I request more than 200 rows in one API call" as UNCONFIRMED and
test it.** For a few-thousand-row table answered as a top-N, this never binds: ask for
`LIMIT 50` and omit `max_result_rows`, or set it to a value ≤ 200.

**The inline/async boundary is the number you should actually design around**, and it
is precise:

> Executes an arbitrary SQL query against the engine. **If the query resolves in under
> 10 seconds and returns less than 4 MiB, the response will be an inline HTTP 200
> OK.** Otherwise, a 202 Accepted response redirects the client to retrieve results
> from a separate streamed data location.

— [Execute SQL Statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/); and "Returned when data sets exceed 4 MiB or execution
times cross the 10s processing barrier."

And the prose warns you cannot opt out of handling both: "The server decides whether a
query runs asynchronously, not your application. … **You can't predict or control
which response you get, so your application must handle both `200` and `202`
responses.**" ([api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html)) A top-50 projection of a few columns is far under 4 MiB,
so the 200 path is overwhelmingly likely — but a correct client still needs the 202
branch. The async flow is: poll
`/query/v1/jobs/{env}/{lkc}/{topic}/{statement_id}/status` with the same credential
until `SUCCEEDED`, then GET the presigned `result_urls[0]` **without** an
`Authorization` header ("If you include one, cloud storage rejects the request").

**MCP limits, verbatim table:**

| Limit | Value |
|---|---|
| Maximum rows returned | 200 |
| Query timeout (seconds) | 20 |

> The `max_result_rows` parameter is required on every `queryData` call. Setting it to
> 0 or omitting it returns an error. The SQL `LIMIT` clause can further reduce the
> result set but can't exceed the `max_result_rows` cap.

— [Query a Lightning Table with MCP](https://docs.confluent.io/cloud/current/lightning-tables/query/mcp.html)

### Concurrent queries

**No numeric concurrency limit is documented. UNCONFIRMED.** The docs only make
qualitative claims: Lightning Table queries are for "point lookups, range scans, and
full scans from many concurrent clients, such as applications and AI agents"
([query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html)), and the Streamhouse page markets "high concurrency"
([streamhouse/query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html)).

What *is* documented is a **shared rate limit, with no published number**:

> Lightning Table queries through the API share a rate limit with the Real-Time
> Context Engine MCP tools (`listTopics`, `getMetadata`, and `queryData`). Requests
> from either count toward that limit. When you exceed the limit, the MCP tools report
> `RATE_LIMIT_EXCEEDED`, and a request to the query endpoint returns a `429` response.
> Requests to the job status endpoint don't count toward this rate limit.

— [api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html)

The actual ceiling is discoverable only at runtime, from response headers the API
reference documents on the 429: `X-RateLimit-Limit` ("The maximum number of requests
you're permitted to make per time period"), `X-RateLimit-Remaining`,
`X-RateLimit-Reset` (relative seconds, not epoch — the reference flags this as
deliberately unlike GitHub's and Twitter's same-named header), and `Retry-After`
([Execute SQL Statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/)). **Read `X-RateLimit-Limit` off a real response during the
build to learn the number.** Also note the sharing: an MCP-connected agent in the demo
competes with the dashboard's own polling.

### Bytes scanned, and what a CCU is

**A CCU is a Confluent Compute Unit**, and the prior "80 GB scanned per CCU-hour" note
is confirmed but needs its context. Verbatim, from [Real-Time Context Engine
Billing](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html):

> A Confluent Compute Unit (CCU) is a logical unit of processing power. It reflects the
> compute resources used to read from Kafka and materialize your data, making it
> queryable. It also reflects the resources used to serve your queries.
>
> ### Definition of one CCU
>
> A single CCU covers the following:
>
> - **Hot memory size**: Compute for a hot memory size supporting roughly 40 GB of
>   base storage.
> - **Query scan**: Up to 80 GB scanned by your queries per hour, whether that's one
>   large query or many small ones.
> - **Ingest throughput**: Up to 10 MBps of sustained data streaming in.
>
> **You pay for whichever meter is highest in a given minute. A CCU isn't "40 GB and
> 80 GB and 10 MBps" all at once. It's whichever single threshold your workload
> reaches.**

So 80 GB/hour is a *billing threshold on a max-of-three-meters*, not a quota and not a
hard scan ceiling. Exceeding it costs more CCUs; nothing is rejected. **No documented
overage penalty or scan cap — UNCONFIRMED.**

**Does the user choose a CCU count? No.** CCUs are autoscaled, not provisioned:

> Usage scales with your workload. The more data you materialize or query, the more
> CCUs you consume, and usage scales back down when activity drops. You pay only for
> what you use, metered every minute.

and

> You don't need to size a cluster or provision and scale anything manually. You enable
> the Real-Time Context Engine on a topic, and your cost follows your usage.

The overview page agrees: "Lightning Tables are fully managed. You don't need to
provision infrastructure, write Kafka consumers, or manage Apache Flink® jobs."
([overview](https://docs.confluent.io/cloud/current/lightning-tables/overview.html))

Pricing, for the demo budget: **$0.105 per CCU-hour ($0.00175 per CCU-minute)** for
compute, **$0.029 per GB-month** for storage, both list prices before the regional
multiplier ([rtce billing](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html)).

Idle behaviour matters for a demo that sits unattended:

> If a table has no new data coming in and no queries running against it, you're not
> charged any CCUs; you pay only for storage on whatever's already materialized.
>
> If data is streaming in but no queries have run yet, you're still charged for the
> compute required to keep the table materialized and current. This continues for as
> long as the topic stays actively streaming, even without any queries running against
> it.
>
> You're charged for the total amount of data scanned in a minute, not the number of
> queries that produced it: ten small queries and one large query cost the same if they
> scan the same amount of data.

A demo producer left running costs CCUs even with nobody watching; stopping the
producer drops you to storage-only. Note also the warning on the naming collision:
"Confluent Compute Units (CCUs) aren't to be confused with a Confluent Consumption Unit
(also abbreviated CCU). That's the unit used for Confluent Cloud marketplace billing,
and the two are unrelated."

**Observability:** three Metrics API counters, all filterable by the `metric.topic`
label — `io.confluent.rtce/compute_utilization/ccu_minutes`,
`io.confluent.rtce/compute_utilization/dp_scanned_bytes` ("The number of bytes that
queries scan in a Lightning Table"), and
`io.confluent.rtce/storage_utilization/storage_bytes` ([Monitor Lightning Tables](https://docs.confluent.io/cloud/current/lightning-tables/monitor.html)).
Querying these needs a **Cloud** API key with the **MetricsViewer** role — a different
credential from the query key. The Console also surfaces per-table "Size" and "Scanned
bytes … in the last 24 hours" ([manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html)).

---

## 4. Authentication to `/query/v1`

### Credential type: a **Global** API key — not a Cloud key, not a cluster key

This is explicit and repeated. From [Query a Lightning Table with the API](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html):

> Requests to this endpoint use HTTP Basic authentication with a Global API key. The
> Global API key is the same credential that you use to connect an MCP client.

The prerequisites list "A Global API key" alongside "The DeveloperRead role, granted on
both the Kafka topic and the Schema Registry cluster."

[Manage Access to Lightning Tables](https://docs.confluent.io/cloud/current/lightning-tables/access-control.html) draws the distinction between key types
sharply:

> You can use a Global API key to query Lightning Tables through the API, MCP, or JDBC
> with HTTP Basic authentication. You can use a Global API key both to manage Lightning
> Tables and to query data. It works on all supported cluster types, including Basic
> and Standard clusters.
>
> **If you only need to manage Lightning Tables, you can use a Cloud API key instead of
> a Global API key.**

So: **Cloud API key = management plane only. Global API key = querying.** A Global key
is created with key scope **Global** in the Console, or
`confluent api-key create --resource global --service-account <id>`, or
`POST https://api.confluent.cloud/iam/v2/api-keys` with `"resource": {"id": "global"}`.
Note the "including Basic and Standard clusters" clause — it independently re-confirms
the prior finding that Basic qualifies.

A **service-account-owned Global key is the right choice for a server-side proxy**, and
the CLI form documented for creating one is explicitly service-account-scoped
(`--service-account <service_account_id>`). The Console form uses "My account", which
ties the key to a human.

The transport is HTTP Basic with a pre-encoded token:

```bash
export KEY=<api_key>
export SECRET=<api_secret>
export TOKEN=$(echo -n "${KEY}:${SECRET}" | base64 | tr -d '\n')
```

> Use the resulting token in the `Authorization` header of each request:
> `Authorization: Basic <token>`

— [access-control](https://docs.confluent.io/cloud/current/lightning-tables/access-control.html). The API reference names the scheme `resource-api-key` and gives
the server as `https://sql.<region>.<provider>.confluent.cloud`, described as "SQL
Endpoint through Analytics Gateway" ([Execute SQL Statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/)).

### RBAC the querying principal needs

**`DeveloperRead` on both the Kafka topic and the Schema Registry cluster.** The API
page's prerequisites say exactly that: "The DeveloperRead role, granted on **both** the
Kafka topic and the Schema Registry cluster." The role table on
[access-control](https://docs.confluent.io/cloud/current/lightning-tables/access-control.html) (written for the MCP operations, which share the permission
model) shows why both are needed — the two grants cover different operations:

| Role | Scope | List topics | Query data | Get metadata |
|---|---|---|---|---|
| OrganizationAdmin | Organization | Yes | Yes | Yes |
| EnvironmentAdmin | Environment | Yes | Yes | Yes |
| CloudClusterAdmin | Cluster | Yes | Yes | Yes |
| DeveloperRead | Cluster | Yes | Yes | Yes |
| DeveloperRead | **Topic** | No | **Yes** | No |
| DeveloperRead | **Schema Registry cluster** | Yes | No | **Yes** |
| ResourceOwner | Topic | Yes | No | No |
| OrganizationOperator | Organization | Yes | No | No |
| EnvironmentOperator | Environment | Yes | No | No |
| CloudClusterOperator | Cluster | Yes | No | No |
| DeveloperManage | Cluster | Yes | No | No |

`DeveloperRead` **on the topic** grants query but not metadata; `DeveloperRead` **on the
Schema Registry cluster** grants metadata but not query. `DeveloperRead` **at cluster
scope** grants all three in one binding and is the simplest thing to provision. The
page adds the backstop: "You can query data only from topics that you already have
permission to read in Apache Kafka®."

For *enabling* a Lightning Table (a separate, higher privilege): "OrganizationAdmin,
EnvironmentAdmin, CloudClusterAdmin, or ResourceOwner on the topic", and
"OrganizationAdmin, EnvironmentAdmin, and CloudClusterAdmin … also grant permission to
query data."

**One security note that affects a multi-tenant demo.** From the API page, on the job
status endpoint:

> Any user or service account that can read the topic, such as one with the
> DeveloperRead role, can poll the job status and get the result URL. **This applies to
> every statement on that topic, not only the statements that the account ran.**

Statement results are not isolated per caller. Anyone with read on the topic can
retrieve anyone else's async result for that topic.

### Server-side proxy: sanctioned, in substance

The docs do not use the word "proxy", but they repeatedly and explicitly frame the API
as the server-side, application-facing interface:

- "Use the API to run Lightning Table queries from **your applications, dashboards, and
  services**." ([api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html))
- "**API**: Run Lightning Table queries from applications, dashboards, and services.
  You authenticate with a Global API key." ([query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html))
- The Streamhouse page names the audience: "Application, AI/ML, and platform
  engineers", for "agent context, user-facing dashboards, and in-app analytics."
  ([streamhouse/query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html))

A long-lived Global API key held by a backend service is the documented pattern. Note
the model is a single static secret with no documented per-end-user scoping on the API
path — row-level or tenant-level filtering is your proxy's job, not the endpoint's.

### CORS for direct browser calls

**Not documented. UNCONFIRMED — and treat as unsupported.** The string "CORS" does not
appear on any Lightning Tables page, on the `/query/v1` API reference, or on the job
status reference. There is no `Access-Control-Allow-Origin` documentation, no OPTIONS
preflight operation in the OpenAPI definition (the reference states "This endpoint
exposes a single operation"), and no browser/JavaScript client guidance anywhere.

Independently of CORS, a direct browser call would require shipping the Global API key
to the client, which is a credential with cluster-wide read scope. **Go through a
server-side proxy.** Every documented client — the CLI, the JDBC driver, MCP servers,
`curl` — is server-side or desktop. The one Console-adjacent browser client is
Confluent's own first-party pane, which tells you nothing about third-party origins.

---

## 5. The Early Access contradiction

**The contradiction is real, it is live on the docs site as of 2026-11-09, and the docs
do not resolve it.** Here is exactly which page says what.

### Says Early Access, not for production

[Real-Time Context Engine Billing](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html) — also served at
[ai/real-time-context-engine/billing.html](https://docs.confluent.io/cloud/current/ai/real-time-context-engine/billing.html), identical content, no date
stamp on either. Verbatim, in a NOTE box near the top:

> **Direct API access, issuing a lightning query yourself without an AI agent, is an
> Early Access Program feature in Confluent Cloud.**

followed by the full standard EA boilerplate:

> An Early Access feature is a component of Confluent Cloud introduced to gain
> feedback. This feature should be used only for evaluation and non-production testing
> purposes… Early Access Program features are intended for evaluation use in
> development and testing environments only, **and not for production use**. Early
> Access Program features are provided: (a) **without support**; (b) "AS IS"; and (c)
> without indemnification, warranty, or condition of any kind. **No service level
> commitment will apply**… Confluent may discontinue providing preview releases of the
> Early Access Program features at any time in Confluent's sole discretion.

with a link to an Early Access sign-up form. Note the precision of the carve-out: it
scopes EA to *direct API access without an agent* — i.e. exactly the thing this build
depends on — while MCP querying is not covered by it.

This has a traceable origin. The release notes for **August 18, 2026**:

> You can now query the same data the Real-Time Context Engine queries for AI agents
> directly through an API, without an agent, **as an Early Access Program feature**. To
> do this, you issue a *lightning query* — a read against the materialized table
> Confluent maintains for a topic.

— [Release Notes for Confluent Cloud](https://docs.confluent.io/cloud/current/release-notes/index.html), August 18, 2026 entry

So the EA label is a genuine August-2026 fact, not a typo. The question is whether it
survived November.

### Says GA, or at least carries no EA label

1. **Release notes, November 4, 2026** — the Lightning Tables launch entry, with **no
   EA label**, in contrast to the August entry and in contrast to two sibling entries
   in the very same dated section that *are* labelled ("available as a Limited
   Availability feature"). Verbatim:

   > With Lightning Tables, you can query the data in an Apache Kafka® topic with SQL
   > and get sub-second response times. Query a Lightning Table from the Confluent Cloud
   > Console, the Confluent CLI, **an API**, a JDBC client, or an AI agent over the
   > Model Context Protocol (MCP).

   — [Release Notes for Confluent Cloud](https://docs.confluent.io/cloud/current/release-notes/index.html), November 4, 2026 entry. The API is listed
   as a first-class interface with no qualifier.

2. **The explicit "Generally available" table.** [Query Current State with a
   Streamhouse](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html) has an Availability column:

   | If you want to | Use | Through | Availability |
   |---|---|---|---|
   | Look up current state with low latency and high concurrency | Lightning Tables | Confluent Cloud Console, **the API**, MCP, the Confluent CLI, or JDBC | **Generally available** |

   The API is named inside the row marked Generally available.

3. **The API reference carries no EA marking** and is published in the general Confluent
   Cloud API reference: [Execute SQL Statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/) and [Query Async Job
   Status](https://docs.confluent.io/cloud/current/ccloud/get-query-v-1-job-status/). Path is `/query/v1` — a stable `v1`, not `v1alpha1`,
   which independently confirms the prior research. (Third-party sources and an older
   Confluent CLI pull request reference `/query/v1alpha1`; the current official docs
   and reference both say `/query/v1`. Go with `/query/v1`.)

4. **No EA banner on any functional page.** Not on [query/api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html), not on
   [overview](https://docs.confluent.io/cloud/current/lightning-tables/overview.html), not on [query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html), not on
   [sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html), not on [limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html). The
   limitations page — the page whose entire job is to enumerate caveats — does not
   mention Early Access at all.

5. **The billing page links to the API page as ordinary related content**, under
   "Lightning Queries → `../../lightning-tables/query/api.md`", without re-stating any
   restriction.

### Resolution, as far as the docs allow

**The weight of evidence says the API is GA and the billing page's EA note is stale**:
it is a single NOTE on a billing page, traceable to the August 2026 EA release note,
that was not updated when Lightning Tables launched on 4 November 2026 with the API
named as a supported interface in both the release note and the "Generally available"
table. Four current functional pages and the versioned `v1` API reference all treat the
API as ordinary.

**But the docs do not state this, and I cannot confirm it from primary sources.** The
honest position: *one official page currently asserts, in Confluent's own standard
contractual boilerplate, that direct API querying is not for production use, carries no
support, and may be discontinued at any time.* That boilerplate is legal language on a
billing page, which is not the sort of text that is comfortable to dismiss as an
oversight.

**Recommendation:** for a demo, build on it — the capability is documented, versioned
and metered. Before anything production-facing or externally committed, get written
confirmation from Confluent that the billing page's EA note is stale, because the
answer is not derivable from docs.confluent.io.

No page carries a visible last-updated date, so I cannot date the billing page relative
to the November 4 release. The two URLs serving the EA note are
`billing/dimensions/rtce.html` and `ai/real-time-context-engine/billing.html`.

---

## 6. Schema requirement

**A registered Schema Registry schema is mandatory before a Lightning Table can be
enabled.** Verbatim, under "Data model requirements":

> To enable a Lightning Table for a topic, the topic must have a **registered schema**
> in Avro, Protobuf, or JSON Schema format.

— [Lightning Tables Support and Limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html)

### Accepted formats: all three

**Avro, Protobuf and JSON Schema.** Stated four times across the doc set, consistently:

- "Lightning Tables support Basic, Standard, Enterprise, and Dedicated clusters on AWS,
  for topics with **Avro, Protobuf, or JSON Schema** data." ([limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html))
- "Lightning Tables support Avro, Protobuf, and JSON Schema formats."
  ([sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html))
- Prerequisites: "A schema for the topic (Avro, Protobuf, or JSON Schema)."
  ([manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html))
- "The following example adds a nullable column and widens a type for an `orders` topic
  that uses Avro. **The same changes work for Protobuf and JSON Schema.**"
  ([schema-evolution](https://docs.confluent.io/cloud/current/lightning-tables/schema-evolution.html))

No format is privileged; no format is excluded. The gating constraint is **data types**,
not format — see §1. "If your topic schema uses an unsupported data type, you can't
enable a Lightning Table for that topic."

### Key schema vs value schema

**The value needs a schema. The key does not — except that a schemafied key is what
makes the key queryable by name.** Precisely:

- The requirement quoted above speaks of "the topic" having a registered schema; every
  example schema in the docs is a value schema.
- **In append mode (the default), no key is required at all.** Upsert mode's extra
  requirements are stated as being "in addition to the general data model
  requirements", which means they do not apply to append mode.
- **In upsert mode, a Kafka record key is required, but a key *schema* is optional:**

  > The topic must have a Kafka record key, which the Lightning Table uses as the
  > primary key for deduplication. **The key can be raw bytes, or it can use a schema in
  > Avro, Protobuf, or JSON Schema format.** A Lightning Table doesn't support changes
  > to the key schema.

  — [limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html), "Upsert requirements"

  Note the hard constraint in that last sentence: the key schema is immutable.
  "Change the key schema of a topic in upsert mode" appears in the
  [schema-evolution](https://docs.confluent.io/cloud/current/lightning-tables/schema-evolution.html) page's table of **unsupported** changes, with the example
  "Add a `region` field to the key schema of a compacted topic whose record key has a
  schema." Get the key right first time; you cannot evolve it.

**Build implication, tying back to §2:** give the key a schema. A raw-bytes key leaves
you querying an undocumented `KEY` column; a schemafied key gives you the documented
`WHERE CLIENT_ID = '...'` form. And settle the key's shape before you ship, because it
cannot be changed afterwards.

### Mode selection is automatic, driven by `cleanup.policy`

> A Lightning Table automatically selects the ingestion mode based on the topic's
> `cleanup.policy` configuration.

- `cleanup.policy` includes `compact` → **upsert mode**, deduplicated by key, latest
  state per key, tombstones (null values) delete a key and a later record re-adds it,
  last-write-wins.
- Default `delete` policy → **append mode**, every record retained.

— [limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html) and [overview](https://docs.confluent.io/cloud/current/lightning-tables/overview.html)

For a "current state per client" table you want **upsert**, which means a **compacted**
topic with a keyed record. If the table is the backing topic of a Flink materialized
table, this comes free: "The backing topic of a table with a primary key is compacted by
default, so the Lightning Table uses upsert mode and keeps the latest row for each key."
([streamhouse/query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html))

### If the topic has no schema

The Console will create one for you, and registers it:

> A Lightning Table needs a schema for its topic. If the topic doesn't have one, the
> Cloud Console prompts you to create one before it enables the Lightning Table. When
> you apply the schema, Confluent Cloud registers it with Schema Registry.

The flow: Lightning Tables → Add Lightning Table → **clear the "Has schema" checkbox**
to reveal schemaless topics → Enable → "paste a sample JSON message or write your own
schema" → pick a **Format** → Continue → Enable. ([manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html))

### Enabling, for completeness

Prerequisites: a Basic/Standard/Enterprise/Dedicated AWS cluster in a supported region;
a topic; a schema; "at minimum, the CloudClusterAdmin role or the ResourceOwner role on
the topic"; "a Cloud API key for CLI access"; "a Cloud API key or Global API key for
Terraform access" ([manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html)).

Terraform — re-confirming the prior finding on the resource name — verbatim:

```terraform
resource "confluent_rtce_topic" "example" {
  cloud = "AWS"
  description = "Customer orders table"
  environment {
    id = "env-abc123"
  }
  kafka_cluster {
    id = "lkc-abc123"
  }
  region = "us-west-2"
  topic_name = "orders_topic"
}
```

`cloud` is "Required. The cloud provider. Set to `"AWS"`." Disabling = remove the
resource and `terraform apply`.

Two operational notes: a table is queryable only once it is ready — "You can query a
Lightning Table only when its phase is `ACTIVE`" ([cli](https://docs.confluent.io/cloud/current/lightning-tables/query/cli.html)), and HTTP 404
from the query endpoint means "The Lightning Table isn't available for querying, for
example, because it's still being set up. Retry the request." ([api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html)).
The `description` field is worth filling in: "A table description helps AI agents that
query through MCP understand the data in a topic", and it cannot be edited in the
Console — only via CLI/API/Terraform ([manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html)).

---

## 7. Vercel deployment protection on the Hobby plan

Sources: `vercel.com/docs` only. Pages fetched carry `last_updated` between 2026-08-28
and 2026-09-16.

**A Hobby-plan Vercel app can be gated without building your own auth — but only with
Vercel Authentication, which admits logged-in Vercel accounts, not arbitrary visitors
with a password.**

**Vercel Authentication — available on Hobby, free.**

> Vercel Authentication is available on all plans

— [vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), repeated verbatim at
[methods-to-protect-deployments](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments). The pricing table row reads `Vercel
Authentication | Included | Included | Included` across Hobby/Pro/Enterprise
([usage-and-pricing](https://vercel.com/docs/deployment-protection/usage-and-pricing)). Managed per project, and "Hobby teams can also enable or
disable for their own projects."

**Password Protection — NOT available on Hobby. Pro-only, and a paid add-on.**

> Password Protection is available on Enterprise and Pro plans

— [password-protection](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection)

> Password Protection costs $20 per month per protected project on Pro and is included
> at the team level on Enterprise. **Password Protection is not available on Hobby.**

— [methods-to-protect-deployments](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments)

| Plan / billing model | Price | Coverage |
|---|---|---|
| Hobby | Not available | Upgrade to Pro to enable Password Protection |
| Pro | $20/month per protected project | The project where you enable it |
| Enterprise | Included | Every project, team-level |
| Legacy Pro "Advanced Deployment Protection" package | $150/month per team | Every project, team-level |

Vercel's docs name the Hobby workaround themselves:

> Password Protection isn't available on the Hobby plan. **For a free alternative, use
> Vercel Authentication, which every plan includes.** It asks visitors to log in with a
> Vercel account that has access, instead of entering a password.

— password-protection FAQ

**Production coverage on Hobby — yes, but you must change the default.** The Hobby plan
page's Deployment Protection row reads "Vercel Authentication for preview and production
deployments, Deployment Protection Exceptions, and Shareable Links"
([plans/hobby](https://vercel.com/docs/plans/hobby)). The scope setting is plan-independent: "Protecting all
deployments is available on all plans… Select **All Deployments** to secure all
deployments (both preview and production), restricting public access entirely." The
default is **Standard Protection**, which "protects all domains except production
domains" — so a custom domain stays public until you explicitly pick **All
Deployments** ([deployment-protection](https://vercel.com/docs/deployment-protection)).

**Protection Bypass for Automation — available on Hobby.** "Protection Bypass for
Automation is available on all plans"
([protection-bypass-automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)). Header
`x-vercel-protection-bypass: <secret>`, with `x-vercel-set-bypass-cookie: true` for
in-browser use; the secret is exposed as `VERCEL_AUTOMATION_BYPASS_SECRET`. Useful for
letting a scripted screenshot or an uptime check through the gate.

**Other methods, by plan:**

| Feature | Hobby | Quoted availability |
|---|---|---|
| Standard Protection (all but production) | Included | "Standard Protection is available on all plans" |
| All Deployments scope | Included | "Protecting all deployments is available on all plans" |
| Shareable Links | Included, **one link per account** | "Developers on the hobby plan can only create one shareable link in total per account" ([sharable-links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links)) |
| Deployment Protection Exceptions | Included | "…available on all plans" |
| OPTIONS Allowlist | Included | "…available on all plans" |
| Trusted Sources (OIDC) | Included | "Trusted Sources are available on all plans" |
| Protected Source Maps | Included | gates `.map` behind Vercel Authentication |
| **Trusted IPs** | **Not available** | "Trusted IPs are available on Enterprise plans" |
| **Only Production Deployments** scope | **Not available** | "only available on the Enterprise plan" |
| **Passport** (own IdP: Okta, Auth0) | **Not available** | "Passport is available on Enterprise plans" |

— [usage-and-pricing](https://vercel.com/docs/deployment-protection/usage-and-pricing) and [methods-to-bypass-deployment-protection](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection)

**The Hobby limit most likely to bite a demo:**

> Those on the Hobby plan can only have one external user per account. If you need
> more, you can upgrade to a Pro plan.

— [vercel-authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), "Access requests"

One external viewer. If the demo needs to be shown to several people who are not on your
Vercel account, Hobby + Vercel Authentication will not carry it: you get one external
user plus one Shareable Link. For a wider audience, Pro ($20/month/project for Password
Protection) or your own auth.

**Three caveats from the docs:**

- Turning on Standard Protection or All Deployments breaks server-side fetches to
  `VERCEL_URL` / `VERCEL_BRANCH_URL`; the docs prescribe relative paths client-side and
  forwarding the incoming `cookie` header server-side
  ([deployment-protection#how-to-migrate-to-standard-protection](https://vercel.com/docs/deployment-protection#how-to-migrate-to-standard-protection)).
- "Deployment Protection requires authentication for all requests, including those to
  Routing Middleware" ([deployment-protection](https://vercel.com/docs/deployment-protection)).
- Disabling Vercel Authentication unprotects all existing deployments, and re-enabling
  it does not force previously authenticated users to log in again — cookies persist.

Separately: Hobby is "non-commercial, personal use only" per Vercel's fair use
guidelines ([plans/hobby](https://vercel.com/docs/plans/hobby)). A client-facing or employer-facing demo may
not belong on Hobby regardless of what can be gated.

---

## Open items to settle by testing, not by reading

The docs are unusually complete; these are the real gaps, in priority order.

1. **Does `ORDER BY <expression>` work?** And do arithmetic expressions work in the
   projection? Undocumented in both directions. **Design around it:** materialise the
   utilisation ratio as a `DECIMAL` column in the topic. Then the top-N query is a bare
   `ORDER BY` on a stored column, which is squarely documented.
2. **Can a single API call return more than 200 rows?** Prose says no row limit; the
   OpenAPI schema caps `max_result_rows` at 200. Resolve empirically. Irrelevant for
   top-N.
3. **What is the key column called when the key is raw bytes?** `KEY` appears once, in
   passing. Run `DESCRIBE <topic>` against the real table and pin the names. Better:
   use a schemafied key and sidestep it.
4. **What is the actual rate limit?** Read `X-RateLimit-Limit` off a live response. Note
   that the dashboard's polling shares this budget with any MCP agent in the demo.
5. **What is the maximum result size?** Prose says one exists without giving a number;
   4 MiB is documented only as the inline/async switch, not as a cap.
6. **Is the billing page's Early Access note stale?** Not answerable from the docs. Ask
   Confluent before committing to anything beyond a demo.
7. **CORS:** assume none. Proxy server-side and never ship the Global API key to a
   browser.
