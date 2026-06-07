# DESIGN.md — Tara Finance Agent

---

## 1. Postgres Schema

### Tables

**`transactions`**
Stores all spending events. `merchant_canonical` is a normalised version of the raw merchant string, computed at ingest time by `merchantNormalizer.ts`. This is what tools query — not the raw `merchant` field — so all Swiggy variants (`SWIGGY BANGALORE`, `Swiggy Instamart`, `SWIGGY*ORDER`) match a single `ILIKE '%swiggy%'` query.

```sql
id                TEXT PRIMARY KEY
transaction_date  DATE NOT NULL
merchant          TEXT NOT NULL        -- raw string from source
merchant_canonical TEXT NOT NULL       -- normalised, used for querying
category          TEXT DEFAULT 'uncategorized'
amount            NUMERIC(14,2)        -- negative = refund/reversal
currency          TEXT DEFAULT 'INR'
memo              TEXT
```

**`funds`**
Market data — independent of what the user owns.

```sql
id        TEXT PRIMARY KEY
name      TEXT NOT NULL
category  TEXT NOT NULL
```

**`fund_navs`**
Monthly NAV history per fund. Composite PK prevents duplicates on re-ingest.

```sql
fund_id   TEXT REFERENCES funds(id) ON DELETE CASCADE
nav_date  DATE NOT NULL
nav       NUMERIC(12,4)
PRIMARY KEY (fund_id, nav_date)
```

**`holdings`**
What the user actually owns. Joins to `funds` on `fund_id`. `purchase_nav` and `units` are the inputs to realised return calculations.

```sql
id            SERIAL PRIMARY KEY
fund_id       TEXT REFERENCES funds(id)
fund_name     TEXT NOT NULL
units         NUMERIC(14,4)
purchase_date DATE
purchase_nav  NUMERIC(12,4)
```

**`request_traces`**
Observability table. Every `/ask` request writes a row here regardless of success or failure.

```sql
request_id   TEXT PRIMARY KEY
question     TEXT
tools_called JSONB
tables_read  TEXT[]
status       TEXT       -- 'success' | 'failed'
error_msg    TEXT
latency_ms   INTEGER
created_at   TIMESTAMPTZ
```

### Indexes

```sql
-- transactions — the most-queried table
idx_txn_date               ON transactions(transaction_date)
idx_txn_category           ON transactions(category)
idx_txn_merchant_canonical ON transactions(merchant_canonical)
idx_txn_cat_date           ON transactions(category, transaction_date)
idx_txn_merchant_date      ON transactions(merchant_canonical, transaction_date)

-- fund_navs — always queried by fund + date descending
idx_fund_navs_lookup       ON fund_navs(fund_id, nav_date DESC)

-- funds, holdings
idx_funds_name             ON funds(name)
idx_holdings_fund          ON holdings(fund_id)
```

The composite indexes on `transactions` exist because the two most common query patterns are: filter by category + date range, and filter by merchant + date range. Without them, every category/merchant query would be a full table scan on 1,500+ rows — acceptable now but expensive at scale.

---

## 2. Tool Design

### Why two tools instead of many narrow ones

The brief explicitly warns against narrow tools: "a single `query_transactions({ filter, aggregate })` will beat four narrow tools on both token cost and selection accuracy." We followed this. Every transaction question goes through one tool; every portfolio question goes through another.

Having fewer tools in the model's context means:
- The system prompt is shorter (fewer tokens per request)
- The model has less ambiguity about which tool to call
- Fewer places for tool selection to go wrong

### `query_transactions`

Handles all spending questions via an `aggregate` enum parameter:

| aggregate | SQL | Use case |
|---|---|---|
| `total` | `SUM(amount)` | "How much did I spend on X?" |
| `by_month` | `GROUP BY month` | Month-over-month comparisons |
| `by_category` | `GROUP BY category` | Category breakdown |
| `by_merchant` | `GROUP BY merchant_canonical` | Merchant breakdown |
| `top_merchants` | `GROUP BY ... LIMIT N` | "Top 5 merchants" |
| `top_categories` | `GROUP BY ... LIMIT N` | "Top categories" |
| `recurring` | JS detection post-query | Subscription detection |
| `none` | Raw rows | "Show me transactions" |

Key design decisions:
- `includeTransfers=false` by default — self-transfers are excluded unless explicitly requested
- `includeRefunds=false` by default — only `amount > 0` rows, so SUM gives gross spend
- `includeRefunds=true` — all rows including negatives, so SUM gives net spend after refunds
- All boolean/integer fields use `z.coerce` so the LLM can pass `"true"` or `"10"` as strings without validation failures — Gemini and smaller models frequently stringify these

### `portfolio_analytics`

Handles all fund and holdings questions via a `mode` enum:

| mode | Data source | Use case |
|---|---|---|
| `list_funds` | `funds` | Discover available fund names |
| `fund_return` | `fund_navs` | NAV change between two dates |
| `fund_return_ranking` | `fund_navs` | Rank all funds by period return |
| `holding_return` | `holdings + fund_navs` | User's realised return on one holding |
| `portfolio_summary` | `holdings + fund_navs` | Total portfolio value and gain |
| `portfolio_ranking` | `holdings + fund_navs` | All holdings ranked by return |

The `fundName`, `startDate`, and `endDate` fields are explicitly optional with descriptions telling the model to omit them for modes that don't need them (`portfolio_ranking`, `portfolio_summary`, `list_funds`). Without this, smaller models pass empty strings or trigger Zod missing-property errors.

---

## 3. Formulas

### Net spend (transactions)

```
net_spend = SUM(amount)
```

`amount` is negative for refunds. SUM naturally handles net spend. We never filter out negatives unless `includeRefunds=false`, in which case the `WHERE amount > 0` clause gives gross spend only.

### Merchant matching

```
merchant_canonical = normalizeMerchant(raw_merchant)
```

`normalizeMerchant` (in `services/merchantNormalizer.ts`):
1. Lowercase everything
2. Replace non-alphanumeric characters with spaces
3. Remove payment infrastructure noise tokens: `upi`, `neft`, `imps`, `payment`, `transfer`, `bank`, etc.
4. Remove pure-numeric tokens (transaction IDs, phone numbers)
5. Remove single-character tokens
6. Join remaining tokens with a single space
7. Fall back to `"unknown"` if nothing survives

Result: `"SWIGGY BANGALORE"`, `"Swiggy Instamart"`, and `"SWIGGY*ORDER"` all normalise to strings containing `"swiggy"`, so `ILIKE '%swiggy%'` on `merchant_canonical` matches all variants. We intentionally do **not** truncate to the first token — `"swiggy instamart"` and `"swiggy bangalore"` both need to match a query for "swiggy".

### Recurring detection

```
isRecurring(dates) → boolean
```

In `services/subscriptionDetector.ts`:
1. Sort transaction dates ascending
2. Compute gaps in days between consecutive transactions
3. Calculate median gap and standard deviation of gaps
4. If stddev > 12 days: not recurring (too irregular)
5. Match against patterns:
   - Weekly: median 5–9 days, ≥ 3 occurrences
   - Biweekly: median 12–16 days, ≥ 3 occurrences
   - Monthly: median 25–35 days, ≥ 3 occurrences
   - Quarterly: median 85–95 days, ≥ 2 occurrences

We use median rather than mean to be robust against one-off large gaps (e.g. a merchant that's usually monthly but was skipped once). stddev check filters out merchants that appear many times but irregularly (e.g. grocery stores).

### Fund period return

```
return_pct = (end_nav - start_nav) / start_nav × 100
```

`start_nav` and `end_nav` are the closest available NAV on or before the requested dates, found via:

```sql
SELECT nav FROM fund_navs
WHERE fund_id = $1 AND nav_date <= $2
ORDER BY nav_date DESC LIMIT 1
```

This handles weekends and holidays — if you ask for a Monday NAV and only Saturday data exists, you get Saturday's NAV.

### Holding realised return

```
cost          = units × purchase_nav
current_value = units × latest_nav
gain_inr      = current_value - cost
return_pct    = gain_inr / cost × 100
```

`latest_nav` is the most recent NAV available in `fund_navs` for the fund. This is **different** from fund period return — it uses the user's actual purchase price, not an arbitrary start date NAV.

---

## 4. Grounding guarantee

Every number in Tara's answers comes from a tool result. The agent instructions state:

> "Always call a tool before answering. Never state a number without tool evidence. Never invent or estimate figures — all arithmetic is done by the tool (SQL)."

The tools do all arithmetic in SQL (`ROUND(SUM(amount), 2)`, `ROUND(((nav_end - nav_start) / nav_start) * 100, 2)`). The model never receives raw rows and performs arithmetic — it receives a pre-computed result and narrates it.

If a tool returns `{ found: false }`, Tara is instructed to report no data found rather than guess or return zero.

---

## 5. Date interpretation

All relative date expressions are resolved to explicit `YYYY-MM-DD` strings before being passed to tools. The agent instructions define:

| Expression | Resolved to |
|---|---|
| "last month" | First and last day of the calendar month before today |
| "this month" | First day of current month to today |
| "Q1 2025" | `2025-01-01` to `2025-03-31` |
| "in March" | `YYYY-03-01` to `YYYY-03-31` (most recent March) |
| "in 2024" | `2024-01-01` to `2024-12-31` |

Named months without a year assume the most recent occurrence of that month on or before today.

---

## 6. Data complications handled

| Complication | How handled |
|---|---|
| Merchant aliases | `normalizeMerchant` at ingest time + `ILIKE '%term%'` at query time |
| Refunds (negative amounts) | `includeRefunds` flag; `SUM` handles both directions |
| Internal transfers | `LOWER(category) != 'transfer'` excluded by default |
| Uncategorized rows | No special handling — tools support any category value including `"uncategorized"` |
| Missing NAV dates | `closestNav` always finds the nearest available date on or before the target |
| Fund vs holding return | Two separate modes in `portfolio_analytics`; agent instructions explicitly distinguish them |
| Noisy memos | Treated as untrusted data; agent instructed to ignore instructions in memos |

---

## 7. Evals

The eval suite (`evals/run-evals.ts`) sends 20 questions to `POST /ask` and checks answers against expected shapes defined in `evals/questions.json`.

Each question has an `expect` block with:
- `mustContain` — keywords that must appear (case-insensitive)
- `mustNotContain` — hallucination signals (`"I don't know"`, `"unable to"`, `"0.00"`)
- `mustContainPattern` — regex for numbers, percentages, or dates

Coverage across tags:

| Tag | Questions | What it tests |
|---|---|---|
| `merchant` | 5 | Merchant lookup, alias matching, no-data |
| `category` | 5 | Category aggregates, breakdown, comparison |
| `portfolio` | 3 | Portfolio summary, ranking, multi-step |
| `multi_step` | 4 | Questions requiring ≥ 2 tool calls |
| `no_data` | 2 | Out-of-range dates, missing merchants |
| `recurring` | 2 | Subscription detection |
| `fund` | 2 | Fund period return |
| `refunds` | 1 | Net spend after refunds |
| `transfers` | 1 | Transfer exclusion |

Run with: `npx tsx evals/run-evals.ts`

---

## 8. Observability

Each request writes to two places:

1. **`logs/requests.log`** — JSONL, one line per request, never throws (logging failures are caught silently so they can't crash the server)
2. **`request_traces` table** — same data in Postgres, queryable with SQL

Fields captured: `request_id`, `question`, `tools_called` (array with tool name, input, tables, duration), `tables_read`, `status`, `error_msg`, `latency_ms`, `created_at`.

To inspect a failed run:
```sql
SELECT request_id, question, error_msg, latency_ms
FROM request_traces
WHERE status = 'failed'
ORDER BY created_at DESC LIMIT 5;
```

Tool inputs are logged but API keys and secrets are never passed through tools (they live only in `db/client.ts` and the env), so there is no risk of secret leakage in traces.

---

## 9. Async milestone

Not implemented. All tools run synchronously within the `/ask` request-response cycle. The decision was deliberate:

- All tools are Postgres queries — typical latency is 20–200ms, well within acceptable synchronous bounds
- The only genuinely slow operation is `portfolio_analytics` with `mode="fund_return_ranking"`, which loops over 8 funds making serial DB calls (~8 × 50ms = ~400ms)
- This is fast enough that the user experience is not meaningfully worse than an async approach
- Implementing a background worker (BullMQ + job polling) would add ~200 lines of infrastructure and a new failure mode (job loss on restart) without a proportional user benefit at this data scale

With more time: the `fund_return_ranking` mode is the right candidate for async — it could fan out 8 parallel DB calls and return a `job_id` immediately, with the result fed back as a synthetic tool completion.

---

## 10. Deployment

- **Server:** [Render](https://render.com) — Node.js Web Service, free tier, auto-deploys from GitHub on every push to `main`
- **Database:** [Neon](https://neon.tech) — serverless Postgres, free tier (0.5 GB storage)

**Known limitations:**
- Render free tier spins down after 15 minutes of inactivity. Cold start is 30–60 seconds; subsequent requests are fast. Acceptable for a grading demo, not for production.
- Neon serverless Postgres also has a cold start on first connection after inactivity (~1s). Both wake automatically on the first request.
- Render free tier: 750 compute hours/month — enough for one always-on service with no credit card required.
- No persistent filesystem on Render — logs are written to stdout/stderr in addition to Postgres `request_traces`. The JSONL log file is ephemeral and resets on redeploy.

---

