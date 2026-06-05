import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db/client";
import { logTool } from "../../../services/toolLogger";

export const fundReturnTool = createTool({
  id: "fund_return",

  description: "Compute fund NAV return between two dates",

  inputSchema: z.object({
    fundId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
  }),

  execute: async (input) => {
    logTool(
      "fund_return",
      input
    );

    const {
      fundId,
      startDate,
      endDate,
    } = input;

    const start = await db.query(
      `
      SELECT nav
      FROM fund_navs
      WHERE fund_id = $1
        AND nav_date <= $2
      ORDER BY nav_date DESC
      LIMIT 1
      `,
      [fundId, startDate]
    );

    const end = await db.query(
      `
      SELECT nav
      FROM fund_navs
      WHERE fund_id = $1
        AND nav_date <= $2
      ORDER BY nav_date DESC
      LIMIT 1
      `,
      [fundId, endDate]
    );

    if (!start.rows.length || !end.rows.length) {
      return {
        error: "Insufficient NAV data",
      };
    }

    const startNav = Number(
      start.rows[0].nav
    );

    const endNav = Number(
      end.rows[0].nav
    );

    const returnPct =
      ((endNav - startNav) / startNav) * 100;

    return {
      startNav,
      endNav,
      returnPct: Number(
        returnPct.toFixed(2)
      ),
    };
  },
});