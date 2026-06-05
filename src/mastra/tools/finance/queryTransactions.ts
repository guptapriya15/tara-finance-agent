import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db/client";
import { logTool } from "../../../services/toolLogger";

export const queryTransactionsTool = createTool({
  id: "query_transactions",

  description:
    "Fetch transactions filtered by date, category, merchant, refunds, and transfers",

  inputSchema: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    category: z.string().optional(),
    merchant: z.string().optional(),
    includeRefunds: z.boolean().optional(),
    includeTransfers: z.boolean().optional(),
  }),

  execute: async (input) => {
    logTool("query_transactions", input);

    const {
      startDate,
      endDate,
      category,
      merchant,
      includeRefunds = false,
      includeTransfers = false,
    } = input;

    let query =
      `SELECT * FROM transactions WHERE 1=1`;

    const params: any[] = [];
    let i = 1;

    if (startDate) {
      query += ` AND transaction_date >= $${i++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND transaction_date <= $${i++}`;
      params.push(endDate);
    }

    if (category) {
      query += ` AND category = $${i++}`;
      params.push(category);
    }

    if (merchant) {
      query += `
      AND merchant_canonical
      ILIKE '%' || $${i++} || '%'
      `;
      params.push(
        merchant.toLowerCase().trim()
      );
    }

    if (!includeRefunds) {
      query += ` AND amount > 0`;
    }

    if (!includeTransfers) {
      query +=
        ` AND category != 'transfer'`;
    }

    const result = await db.query(
      query,
      params
    );

    return {
      count: result.rows.length,
      rows: result.rows,
    };
  },
});