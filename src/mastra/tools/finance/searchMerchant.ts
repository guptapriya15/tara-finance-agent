import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db/client";

export const searchMerchantTool =
createTool({
  id: "search_merchant",

  description:
    "Find merchant aliases and matching merchant families",

  inputSchema: z.object({
    merchant: z.string(),
  }),

  execute: async ({ merchant }) => {
    const q = `
      SELECT
        merchant,
        merchant_canonical,
        COUNT(*) AS txns
      FROM transactions
      WHERE merchant_canonical
      ILIKE '%' || $1 || '%'
      GROUP BY merchant,
               merchant_canonical
      ORDER BY txns DESC
    `;

    const result =
      await db.query(q, [
        merchant.toLowerCase(),
      ]);

    return result.rows;
  },
});