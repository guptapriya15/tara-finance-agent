import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db/client";
import { logTool } from "../../../services/toolLogger";

export const portfolioAnalyticsTool = createTool({
  id: "portfolio_analytics",

  description: `
Compute portfolio value, cost basis,
absolute gain, percentage return,
and rank holdings by performance.
`,

  inputSchema: z.object({
    mode: z.enum([
      "summary",
      "best_holding",
      "ranking",
    ]),
  }),

  execute: async ({ mode }) => {
    logTool(
      "portfolio_analytics",
      { mode }
    );

    const holdings = await db.query(`
      SELECT
        h.id,
        h.fund_id,
        h.fund_name,
        h.units,
        h.purchase_nav,

        (
          SELECT nav
          FROM fund_navs fn
          WHERE fn.fund_id = h.fund_id
          ORDER BY nav_date DESC
          LIMIT 1
        ) AS current_nav

      FROM holdings h
    `);

    const rows = holdings.rows.map((h) => {
      const cost =
        Number(h.units) *
        Number(h.purchase_nav);

      const currentValue =
        Number(h.units) *
        Number(h.current_nav);

      const gain =
        currentValue - cost;

      const returnPct =
        (gain / cost) * 100;

      return {
        fund: h.fund_name,
        cost,
        currentValue,
        gain,
        returnPct,
      };
    });

    if (mode === "summary") {
      const cost = rows.reduce(
        (a, r) => a + r.cost,
        0
      );

      const value = rows.reduce(
        (a, r) => a + r.currentValue,
        0
      );

      return {
        portfolioCost:
          Number(cost.toFixed(2)),
        portfolioValue:
          Number(value.toFixed(2)),
        gain:
          Number((value - cost)
          .toFixed(2)),
        returnPct:
          Number(
            (
              ((value - cost) / cost)
              * 100
            ).toFixed(2)
          ),
      };
    }

    if (mode === "best_holding") {
      return rows.sort(
        (a, b) =>
          b.returnPct - a.returnPct
      )[0];
    }

    return rows.sort(
      (a, b) =>
        b.returnPct - a.returnPct
    );
  },
});