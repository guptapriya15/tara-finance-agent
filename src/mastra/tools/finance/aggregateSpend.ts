import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db/client";
import { logTool } from "../../../services/toolLogger";

export const aggregateSpendTool = createTool({
  id: "aggregate_spend",

  description:
    "Compute total spend grouped by category or merchant",

  inputSchema: z.object({
    startDate: z.string(),
    endDate: z.string(),
    groupBy: z.enum(["category", "merchant"]),
  }),

  execute: async (input) => {
    logTool(
      "aggregate_spend",
      input
    );

    const {
      startDate,
      endDate,
      groupBy,
    } = input;

    const column =
      groupBy === "merchant"
        ? "merchant_canonical"
        : "category";

    const result = await db.query(
      `
      SELECT
        ${column} as key,
        SUM(amount) as total
      FROM transactions
      WHERE transaction_date BETWEEN $1 AND $2
      AND amount > 0
      AND category != 'transfer'
      GROUP BY ${column}
      ORDER BY total DESC
      `,
      [startDate, endDate]
    );

    return result.rows;
  },
});