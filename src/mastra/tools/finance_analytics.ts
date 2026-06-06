import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db/client";

export const financeAnalytics = createTool({
  id: "finance_analytics",

  description: `
Finance analytics tool.

Use for:
- total spend
- merchant spend
- category spend
- highest expense
- monthly spend
- cashflow
- top merchants
- transaction search
`,

  inputSchema: z.object({
    intent: z.enum([
      "total_spend",
      "merchant_spend",
      "category_spend",
      "highest_expense",
      "monthly_spend",
      "top_merchants",
      "transaction_search",
      "cashflow",
    ]),

    merchant: z.string().optional(),
    category: z.string().optional(),

    startDate: z.string().optional(),
    endDate: z.string().optional(),

    limit: z.number().optional(),
  }),

  execute: async ({
    intent,
    merchant,
    category,
    startDate,
    endDate,
    limit = 10,
  }) => { 

    const start =
      startDate ?? "1970-01-01";

    const end =
      endDate ??
      new Date()
        .toISOString()
        .split("T")[0];

    switch (intent) {
      case "merchant_spend": {
        const result = await db.query(
          `
          SELECT
            merchant_canonical,
            SUM(amount) as total_spend
          FROM transactions
          WHERE amount > 0
          AND LOWER(merchant_canonical)
              LIKE LOWER($1)
          AND transaction_date
              BETWEEN $2 AND $3
          GROUP BY merchant_canonical
        `,
          [
            `%${merchant}%`,
            start,
            end,
          ]
        );

        return result.rows[0] ?? {
          total_spend: 0,
        };
      }

      case "total_spend": {
        const result = await db.query(
          `
          SELECT
            SUM(amount) as total_spend
          FROM transactions
          WHERE amount > 0
          AND transaction_date
              BETWEEN $1 AND $2
        `,
          [start, end]
        );

        return result.rows[0];
      }

      case "category_spend": {
        const result = await db.query(
          `
          SELECT
            category,
            SUM(amount) as total_spend
          FROM transactions
          WHERE amount > 0
          AND LOWER(category)
              LIKE LOWER($1)
          AND transaction_date
              BETWEEN $2 AND $3
          GROUP BY category
        `,
          [
            `%${category}%`,
            start,
            end,
          ]
        );

        return result.rows[0];
      }

      case "highest_expense": {
        const result = await db.query(
          `
          SELECT *
          FROM transactions
          WHERE amount > 0
          ORDER BY amount DESC
          LIMIT 1
        `
        );

        return result.rows[0];
      }

      case "monthly_spend": {
        const result = await db.query(`
          SELECT
            DATE_TRUNC(
              'month',
              transaction_date
            ) as month,
            SUM(amount) as spend
          FROM transactions
          WHERE amount > 0
          GROUP BY month
          ORDER BY month
        `);

        return result.rows;
      }

      case "top_merchants": {
        const result = await db.query(
          `
          SELECT
            merchant_canonical,
            SUM(amount) as spend
          FROM transactions
          WHERE amount > 0
          GROUP BY merchant_canonical
          ORDER BY spend DESC
          LIMIT $1
        `,
          [limit]
        );

        return result.rows;
      }

      case "transaction_search": {
        const result = await db.query(
          `
          SELECT *
          FROM transactions
          ORDER BY transaction_date DESC
          LIMIT $1
        `,
          [limit]
        );

        return result.rows;
      }

      case "cashflow": {
        const result = await db.query(`
          SELECT
            SUM(
              CASE
                WHEN amount > 0
                THEN amount
                ELSE 0
              END
            ) as total_spend,

            SUM(
              CASE
                WHEN amount < 0
                THEN ABS(amount)
                ELSE 0
              END
            ) as total_income
          FROM transactions
        `);

        return result.rows[0];
      }
    }
  },
});