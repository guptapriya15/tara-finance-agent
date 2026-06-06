import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../db/client";

export const portfolioAnalytics = createTool({
  id: "portfolio_analytics",

  description: `
Portfolio analytics tool.

Use for:
- portfolio value
- holdings
- allocation
- performance
`,

  inputSchema: z.object({
    intent: z.enum([
      "summary",
      "holdings",
      "allocation",
    ]),
  }),

  execute: async ({ intent }) => {
    switch (intent) {
      case "summary": {
        const result = await db.query(`
          SELECT
            SUM(current_value) as portfolio_value
          FROM holdings
        `);

        return result.rows[0];
      }

      case "holdings": {
        const result = await db.query(`
          SELECT *
          FROM holdings
          ORDER BY current_value DESC
        `);

        return result.rows;
      }

      case "allocation": {
        const result = await db.query(`
          SELECT
            sector,
            SUM(current_value) as value
          FROM holdings
          GROUP BY sector
          ORDER BY value DESC
        `);

        return result.rows;
      }
    }
  },
});