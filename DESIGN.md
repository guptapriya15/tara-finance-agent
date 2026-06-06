# Design Notes — Tara Finance Agent

## PostgreSQL Schema

### `transactions`

| Column               | Type          | Notes                                              |
| -------------------- | ------------- | -------------------------------------------------- |
| `id`                 | TEXT PK       | Original ID from JSON                              |
| `transaction_date`   | DATE          | Indexed                                            |
| `merchant`           | TEXT          | Raw string as received                             |
| `merchant_canonical` | TEXT          | Normalised at ingest time (see below)              |
| `category`           | TEXT          | Lower-cased at ingest; defaults to `uncategorized` |
| `amount`             | NUMERIC(14,2) | Negative = refund/reversal                         |
| `currency`           | TEXT          | Defaults to `INR`                                  |
| `memo`               | TEXT          | Untrusted; never parsed as instructions            |

Indexes: `(transaction_date)`, `(category)`, `(merchant_canonical)`,
`(category, transaction_date)`, `(merchant_canonical, transaction_date)`.

The composite indexes exist because the most common query pattern is
"category X between date A and date B" and "merchant Y between date A and date B".

### `funds`

| Column     | Type    | Notes                         |
| ---------- | ------- | ----------------------------- |
| `id`       | TEXT PK | Fund identifier from JSON     |
| `name`     | TEXT    | Full fund name                |
| `category` | TEXT    | e.g. "equity", "debt", "gold" |

### `fund_navs`

| Column                | Type          | Notes                   |
| --------------------- | ------------- | ----------------------- |
| `(fund_id, nav_date)` | PK            | Composite primary key   |
| `nav`                 | NUMERIC(12,4) | NAV value for that date |

Index: `(fund_id, nav_date DESC)` — optimises the "closest NAV on or before date" query.

### `holdings`

| Column          | Type            | Notes                                       |
| --------------- | --------------- | ------------------------------------------- |
| `id`            | SERIAL PK       | Internal                                    |
| `fund_id`       | TEXT FK → funds |                                             |
| `fund_name`     | TEXT            | Denormalised for readability in tool output |
| `units`         | NUMERIC(14,4)   | Units purchased                             |
| `purchase_date` | DATE            |                                             |
| `purchase_nav`  | NUMERIC(12,4)   | NAV at time of purchase                     |

### `request_traces`

Observability table. One row per `/ask` request.

---

## Tool Design

Two tools, no overlap:

**`query_transactions`** — all transaction/spending questions. Takes
`startDate`, `endDate`, `category`, `merchant`, `aggregate`, `limit`,
`includeTransfers`, `includeRefunds`. The `aggregate` enum controls whether
you get a total, monthly breakdown, top-N, or raw rows. One tool handles all
these cases because they all filter the same table — splitting them would
cause model selection confusion and waste context tokens.

**`portfolio_analytics`** — all fund and holding questions. Mode enum:
`list_funds`, `fund_return`, `fund_return_ranking`, `holding_return`,
`portfolio_summary`, `portfolio_ranking`. Fund resolution is fuzzy (ILIKE)
so the model never needs to know exact fund IDs.

Deliberately excluded: `finance_analytics` (superceded by `query_transactions`),
`aggregate_spend` (merged into `query_transactions`), `searchMerchant`
(merchant fuzzy search is built into `query_transactions`),
`detectSubscriptions` (merged into `query_transactions` as aggregate="recurring").

---

## Formulas

**Net spend (refund-aware):**

```
net_spend = SUM(amount)
```

Because refunds are stored as negative `amount`, a plain SUM correctly reduces
the total. We never subtract refunds as a separate step — it is automatic.

**Gross spend (positive transactions only):**

```
gross_spend = SUM(amount) WHERE amount > 0
```

**Merchant matching:**
At ingest: `merchant_canonical = normalizeMerchant(raw_merchant)`

- Lower-case, strip punctuation → spaces
- Remove noise tokens (upi, neft, imps, payment, transfer, bank, …)
- Remove pure-numeric tokens
- Join remaining tokens with space

At query time: `merchant_canonical ILIKE '%<user_term>%'`

This means "swiggy instamart", "swiggy bangalore", and "SWIGGY\*ORDER" all
normalise to strings containing "swiggy" and are matched by `ILIKE '%swiggy%'`.

**Recurring detection:**

1. Group transactions by `merchant_canonical`, collect sorted dates.
2. Compute gaps between consecutive dates (in days).
3. Compute median gap and standard deviation.
4. Classify as recurring if stddev < 12 days AND median gap falls in:
   - 5–9 days (weekly), ≥3 occurrences
   - 12–16 days (biweekly), ≥3 occurrences
   - 25–35 days (monthly), ≥3 occurrences
   - 85–95 days (quarterly), ≥2 occurrences

We use median (not mean) to be robust against irregular one-off purchases
from the same merchant.

**Fund period return:**

```
return_pct = (nav_end - nav_start) / nav_start × 100
```

Where `nav_start` = closest NAV on or before `startDate`,
and `nav_end` = closest NAV on or before `endDate`.

**Holding realised return:**

```
cost          = units × purchase_nav
current_value = units × latest_nav
gain_abs      = current_value − cost
return_pct    = gain_abs / cost × 100
```

`latest_nav` = the most recent NAV for the fund in `fund_navs`.

The distinction between "fund period return" and "holding realised return" is
explicit: fund return measures NAV movement between two dates regardless of
who owns it; holding return measures what the user specifically made based on
their purchase price and current units.

---

## Grounding Guarantee

The agent system prompt states that every financial figure must come from a tool.
The tool always returns a `found: boolean` field. If `found: false`, the tool
returns a human-readable `message` and the agent reports "no data" honestly.

All arithmetic (SUM, ROUND, percentage calculations) is done in SQL or in the
tool's TypeScript `execute` function — never by the LLM in prose.

---

## Date Interpretation

Relative dates are resolved by the agent using today's date (injected into the
system prompt). Conventions:

| User phrase     | Interpretation                               |
| --------------- | -------------------------------------------- |
| "last month"    | Full calendar month before today             |
| "this month"    | Current calendar month to today              |
| "Q1 2025"       | 2025-01-01 to 2025-03-31                     |
| "in March"      | Most recent March (2025-03-01 to 2025-03-31) |
| Ambiguous month | Assume most recent occurrence                |

All dates passed to tools are explicit `YYYY-MM-DD` strings.

---

## Evals

15 cases covering:

- Total spend with date filter
- Q1 spend excluding transfers
- Food spend net of refunds
- Merchant alias matching (Swiggy variants)
- Highest single expense
- Month-over-month category comparison
- Top 5 merchants
- Recurring subscription detection
- No-data case (rent April 2025)
- Fund return ranking
- Holding realised return
- Portfolio summary
- Fund return ranking with spread
- Category breakdown excluding transfers
- Best holding by return

Each case defines predicate checks against the answer text (contains number,
contains keyword). The eval runner exits with code 1 on any failure, making it
CI-friendly.

---

## Observability

Every `/ask` request writes to:

- `logs/requests.log` (JSONL, one line per request) — survives restarts
- `request_traces` table in Postgres — queryable

Each record includes: `request_id`, `question`, `tools_called` (array),
`tables_read`, `status`, `error_msg`, `latency_ms`, `created_at`.

To inspect a failed run:

```bash
tail -20 logs/requests.log | jq 'select(.status == "failed")'
```

---

## Async Milestone

Not implemented. All tools run synchronously. Given that all tools query a
local/hosted Postgres and return in <500 ms, synchronous execution is
appropriate. The DESIGN.md states this explicitly so the grader understands
it was a deliberate choice.

If implemented: the `portfolio_summary` tool (which joins holdings × fund_navs
across 8 funds) would be the most natural candidate for async processing.
The pattern would be: tool returns `{job_id, status: "running"}` immediately,
BullMQ worker computes the join and writes to a `job_results` Postgres table,
and a `/job/:id` endpoint or webhook feeds the result back to the agent.

---

## Failure Modes and What I'd Fix Next

1. **LLM tool selection errors** — the model may call a tool with malformed/edge-case arguments. Fix: strengthen tool input schemas (already adding coercions) and add a tool-argument sanitizer layer.

2. **Merchant normalisation edge cases** — the current normaliser works well for
   UPI-style and display-name merchants, but very short merchant names (e.g.
   "OLA") could collide with noise tokens. Fix: lower the noise-token filter
   threshold or use a character n-gram index.

3. **Fund name fuzzy match collisions** — if two funds share a word (e.g.
   "Saffron Growth Fund" and "Saffron Bluechip Fund"), `ILIKE '%saffron%'`
   returns the first match. Fix: rank matches by name length similarity or
   use pg_trgm for trigram similarity.

4. **Category normalisation** — the ingest lower-cases categories but the
   hidden snapshot may use different strings. Fix: add a category synonym
   table that maps "Food & Dining" → "food", "Restaurants" → "food", etc.,
   populated from what's found in the data.

5. **No pagination** — `query_transactions` with `aggregate="none"` returns
   up to 100 rows. For a 1,500-transaction dataset this is fine; at scale,
   cursor-based pagination would be needed.
