# Keewano queries used by Aid

Sources: https://docs.keewano.com/llms.txt, SQL Guide and SQL Reference (sql-query-studio). Aid reads Keewano over the
Postgres wire protocol (`keewanoSql` in `src/keewano.ts`) and, for the staff Ask box, over MCP (`https://api.keewano.com/mcp`, header `k-token`).

## Syntax notes (what bit us)

- One table: `events`. One row per event. Every user (= one household, `user_id` = our household id) is a timeline.
- Event names are columns and need double quotes: `"InterviewScheduled"`. Always `FROM events`.
- Columns hold their last value forward (step functions). `WHERE` selects stretches of a timeline, not rows.
  `WHERE "DocsRequested" > 0` = everything after the request; aggregates inside only see events after it.
  `count(x)` counts occurrences of event `x` inside those stretches; `count(*)` counts all events.
- No JOIN, CTE, window functions, UNION, correlated subqueries. Use `FROM (SELECT ... GROUP BY user_id) s WHERE ...` for per-user then filter.
- `HAVING`/outer `WHERE` compare an aggregate or column to a constant only; no arithmetic on columns. `now() - INTERVAL '3 days'` is fine.
- `FILTER (WHERE ...)` accepts one comparison on one event column; it cannot filter on `event_datetime`. Put conditions in `WHERE` instead.
- `min/max(event_datetime)` work; `min/max(user_registration_time)` and `min("Event")` in the SELECT list do not ("unsupported aggregate"). Group by `user_registration_time` to project it.
- `occurrence("E") = 1` selects from the first occurrence of E. No "latest value" in SQL (that is Lua territory); we approximate.
- Timestamps are epoch seconds, UTC. Limits: 16 KB/statement, 50 MB/result, ~2 min/query.
- Lua (`run_script_query`) can express exact "latest state" logic; not used because SQL was sufficient.

## Autopilot (`src/autopilot.ts`, QUERIES)

Each returns one row per household in `user_id`; the app turns rows into Actions (source `keewano`).
Status: all five parse and execute on the live project (verified via MCP `run_sql_query`). Live-data verification is noted below.

### interview_nudge: interview scheduled in the next 48h, not confirmed

```sql
SELECT s.user_id AS user_id, s.at AS at FROM (
  SELECT user_id, max("InterviewScheduled") AS at, count("InterviewConfirmed") AS confirmed
  FROM events WHERE "Source" = 'aid' GROUP BY user_id) s
WHERE s.confirmed = 0 AND s.at BETWEEN now() AND now() + INTERVAL '48 hours' LIMIT 200
```

### docs_nudge: documents requested over 3 days ago, none received since

```sql
SELECT s.user_id AS user_id, s.requested_at AS requested_at FROM (
  SELECT user_id, min(event_datetime) AS requested_at, count("DocReceived") AS received
  FROM events WHERE "Source" = 'aid' AND "DocsRequested" > 0 GROUP BY user_id) s
WHERE s.received = 0 AND s.requested_at < now() - INTERVAL '3 days' LIMIT 200
```

### submit: packet signed, application never submitted

```sql
SELECT s.user_id AS user_id FROM (
  SELECT user_id, count("PacketSigned") AS signed, count("ApplicationSubmitted") AS submitted
  FROM events WHERE "Source" = 'aid' GROUP BY user_id) s
WHERE s.signed > 0 AND s.submitted = 0 LIMIT 200
```

### waitlist_check: WaitlistStatus closed for 7+ days (approximation: first closed event; a later "open" ends the stretch)

```sql
SELECT s.user_id AS user_id, s.closed_at AS closed_at FROM (
  SELECT user_id, min(event_datetime) AS closed_at, count("WaitlistStatus") AS closed
  FROM events WHERE "Source" = 'aid' AND "WaitlistStatus" = 'closed' GROUP BY user_id) s
WHERE s.closed_at < now() - INTERVAL '7 days' LIMIT 200
```

### renewal_start: RenewalDue within 30 days, no PacketSigned since RenewalDue

```sql
SELECT s.user_id AS user_id, s.due AS due FROM (
  SELECT user_id, max("RenewalDue") AS due, count("PacketSigned") AS signed
  FROM events WHERE "Source" = 'aid' AND "RenewalDue" IS NOT NULL GROUP BY user_id) s
WHERE s.signed = 0 AND s.due BETWEEN now() AND now() + INTERVAL '30 days' LIMIT 200
```

## Metrics (`src/metrics.ts`)

Cohorts are the `Source` event (`aid` vs `baseline`). Medians, percentages and missed-interview rates are computed in JS (`aggregateCohorts`) from per-household rows.

### COHORT_SQL

```sql
SELECT "Source" AS src, user_id,
  count("ApplicationSubmitted") AS submitted, count("InterviewScheduled") AS scheduled, count("InterviewConfirmed") AS confirmed
FROM events WHERE "Source" IS NOT NULL GROUP BY src, user_id
```

### SUBMIT_TIME_SQL (seconds converted to hours in JS)

```sql
SELECT user_id, user_registration_time AS reg, min(event_datetime) AS submitted_at
FROM events WHERE occurrence("ApplicationSubmitted") = 1 GROUP BY user_id, user_registration_time
```

## Insights (`src/insights.ts`)

`NudgeVariant` holds forward after each nudge, so events counted in the stretch are those that followed that wording.

### VARIANT_SQL

```sql
SELECT "NudgeVariant" AS variant, count("NudgeVariant") AS sent,
  count("InterviewConfirmed") AS confirmed, count("DocReceived") AS docs, count("PacketSigned") AS signed
FROM events WHERE "NudgeVariant" IS NOT NULL GROUP BY variant
```

## Verification status

- Every query above was parsed and executed against the live project through MCP `run_sql_query` (syntax and column names verified, `keewanoSql` over pgsql.keewano.com also connects).
- Row semantics were NOT verified against data: when this was written the project returned 0 events (ingest from the coordinator had not become queryable). Treat semantics as guessed until the demo households (Rosa/James/Lin/Marcus) show up.
- Known approximations: `waitlist_check` uses the first closed event (not the latest); `interview_nudge` treats any InterviewConfirmed as confirming; `renewal_start` relies on the RenewalDue stretch.

