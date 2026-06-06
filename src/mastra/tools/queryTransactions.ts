import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db/client.js";

/**
 * query_transactions
 *
 * One tool to handle all transaction-level questions:
 * - total spend, net spend, category breakdowns
 * - merchant lookups (fuzzy, via ILIKE on merchant_canonical)
 * - date filtering
 * - month-over-month aggregates
 * - top-N merchants / categories
 * - refund-aware (amount > 0 by default; net = SUM(amount) handles negatives)
 * - transfer exclusion (category != 'transfer' by default)
 * - subscription / recurring detection
 * - raw transaction rows for inspection
 *
 * Tables read: transactions
 */
export const queryTransactionsTool = createTool({
  id: "query_transactions",

  description: `
Query the transactions database. Use for ANY question about spending,
merchants, categories, refunds, or recurring subscriptions.

aggregate options:
  "none"     → return raw rows (use for "show me", "list", "search")
  "total"    → SUM(amount) over the filter window — net spend after refunds
  "by_month" → monthly spend grouped by month
  "by_category" → spend grouped by category
  "by_merchant" → spend grouped by merchant_canonical
  "top_merchants" → top-N merchants by net spend
  "top_categories" → top-N categories by net spend
  "recurring" → detect merchants with recurring transaction patterns

Set includeTransfers=true only when the user explicitly asks about transfers.
Set includeRefunds=true only when the user asks specifically about refunds/reversals.
For net-spend questions, use aggregate="total" — SUM handles negatives automatically.
`.trim(),

  inputSchema: z.object({
    startDate: z.string().optional().describe("ISO date YYYY-MM-DD, inclusive"),
    endDate:   z.string().optional().describe("ISO date YYYY-MM-DD, inclusive"),
    category:  z.string().optional().describe("Category filter (partial match, case-insensitive)"),
    merchant:  z.string().optional().describe("Merchant filter — matched against merchant_canonical via ILIKE"),
    aggregate: z
      .enum(["none", "total", "by_month", "by_category", "by_merchant", "top_merchants", "top_categories", "recurring"])
      .default("none"),
    limit: z.number().int().min(1).max(100).optional().default(10)
      .describe("Used for top_merchants / top_categories / none (row limit)"),
    includeTransfers: z.boolean().optional().default(false),
    includeRefunds:   z.boolean().optional().default(false)
      .describe("If false (default), only amount>0 rows; if true, all amounts"),
  }),

  execute: async (input) => {
    const {
      startDate,
      endDate,
      category,
      merchant,
      aggregate,
      limit,
      includeTransfers,
      includeRefunds,
    } = input;

    const start = startDate ?? "1970-01-01";
    const end   = endDate   ?? new Date().toISOString().slice(0, 10);

    // ----- base WHERE fragments -----
    const conditions: string[] = [
      `transaction_date BETWEEN $1 AND $2`,
    ];
    const params: unknown[] = [start, end];
    let idx = 3;

    if (!includeTransfers) {
      conditions.push(`LOWER(category) != 'transfer'`);
    }

    if (!includeRefunds) {
      conditions.push(`amount > 0`);
    }

    if (category) {
      conditions.push(`LOWER(category) ILIKE $${idx++}`);
      params.push(`%${category.toLowerCase()}%`);
    }

    if (merchant) {
      conditions.push(`merchant_canonical ILIKE $${idx++}`);
      params.push(`%${merchant.toLowerCase().trim()}%`);
    }

    const WHERE = `WHERE ${conditions.join(" AND ")}`;

    // ----- aggregate dispatch -----
    switch (aggregate) {
      case "total": {
        const r = await db.query(
          `SELECT
             ROUND(SUM(amount), 2)                                AS net_spend,
             ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2) AS gross_spend,
             ROUND(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 2) AS total_refunds,
             COUNT(*)                                             AS transaction_count
           FROM transactions ${WHERE}`,
          params
        );
        const row = r.rows[0];
        if (!row || row.net_spend === null) {
          return { found: false, message: "No transactions found for the given filters." };
        }
        return { found: true, ...row };
      }

      case "by_month": {
        const r = await db.query(
          `SELECT
             TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,
             ROUND(SUM(amount), 2)                                      AS net_spend,
             COUNT(*)                                                   AS count
           FROM transactions ${WHERE}
           GROUP BY DATE_TRUNC('month', transaction_date)
           ORDER BY DATE_TRUNC('month', transaction_date)`,
          params
        );
        if (!r.rows.length) return { found: false, message: "No data for the requested period." };
        return { found: true, rows: r.rows };
      }

      case "by_category": {
        const r = await db.query(
          `SELECT
             category,
             ROUND(SUM(amount), 2) AS net_spend,
             COUNT(*)              AS count
           FROM transactions ${WHERE}
           GROUP BY category
           ORDER BY net_spend DESC`,
          params
        );
        if (!r.rows.length) return { found: false, message: "No category data found." };
        return { found: true, rows: r.rows };
      }

      case "by_merchant": {
        const r = await db.query(
          `SELECT
             merchant_canonical,
             ROUND(SUM(amount), 2) AS net_spend,
             COUNT(*)              AS count
           FROM transactions ${WHERE}
           GROUP BY merchant_canonical
           ORDER BY net_spend DESC`,
          params
        );
        if (!r.rows.length) return { found: false, message: "No merchant data found." };
        return { found: true, rows: r.rows };
      }

      case "top_merchants": {
        params.push(limit ?? 10);
        const r = await db.query(
          `SELECT
             merchant_canonical,
             ROUND(SUM(amount), 2) AS net_spend,
             COUNT(*)              AS count
           FROM transactions ${WHERE}
           GROUP BY merchant_canonical
           ORDER BY net_spend DESC
           LIMIT $${idx}`,
          params
        );
        if (!r.rows.length) return { found: false, message: "No merchant data found." };
        return { found: true, rows: r.rows };
      }

      case "top_categories": {
        params.push(limit ?? 10);
        const r = await db.query(
          `SELECT
             category,
             ROUND(SUM(amount), 2) AS net_spend,
             COUNT(*)              AS count
           FROM transactions ${WHERE}
           GROUP BY category
           ORDER BY net_spend DESC
           LIMIT $${idx}`,
          params
        );
        if (!r.rows.length) return { found: false, message: "No category data found." };
        return { found: true, rows: r.rows };
      }

      case "recurring": {
        // Pull all merchants + dates, then apply recurring detector in JS
        // (SQL-only recurring detection requires window functions that are
        //  harder to generalise; JS gives us full control over the algorithm)
        const r = await db.query(
          `SELECT
             merchant_canonical,
             transaction_date::text AS date,
             ROUND(amount, 2)       AS amount
           FROM transactions ${WHERE}
           ORDER BY merchant_canonical, transaction_date`,
          params
        );

        if (!r.rows.length) return { found: false, message: "No transactions found." };

        // group dates by merchant
        const groups = new Map<string, { dates: Date[]; amounts: number[] }>();
        for (const row of r.rows) {
          if (!groups.has(row.merchant_canonical)) {
            groups.set(row.merchant_canonical, { dates: [], amounts: [] });
          }
          const g = groups.get(row.merchant_canonical)!;
          g.dates.push(new Date(row.date));
          g.amounts.push(Number(row.amount));
        }

        const { isRecurring } = await import("../../services/subscriptionDetector.js");

        const recurring: Array<{
          merchant: string;
          occurrences: number;
          typical_amount: number;
        }> = [];

        for (const [merchant, { dates, amounts }] of groups) {
          if (isRecurring(dates)) {
            const sorted = [...amounts].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            recurring.push({
              merchant,
              occurrences: dates.length,
              typical_amount: Number(median.toFixed(2)),
            });
          }
        }

        if (!recurring.length) {
          return { found: false, message: "No recurring merchants detected in this period." };
        }
        return { found: true, rows: recurring.sort((a, b) => b.occurrences - a.occurrences) };
      }

      case "none":
      default: {
        params.push(limit ?? 10);
        const r = await db.query(
          `SELECT
             id,
             transaction_date::text AS date,
             merchant,
             merchant_canonical,
             category,
             ROUND(amount, 2) AS amount,
             currency,
             memo
           FROM transactions ${WHERE}
           ORDER BY transaction_date DESC
           LIMIT $${idx}`,
          params
        );
        if (!r.rows.length) return { found: false, message: "No transactions found." };
        return { found: true, count: r.rows.length, rows: r.rows };
      }
    }
  },
});