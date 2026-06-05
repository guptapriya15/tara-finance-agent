import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db/client";
import { logTool } from "../../../services/toolLogger";

export const holdingReturnTool = createTool({
  id: "holding_return",

  description:
    "Compute realised return for user's fund holdings",

  inputSchema: z.object({
    holdingId: z.number(),
  }),

  execute: async (input) => {
    logTool(
      "holding_return",
      input
    );

    const { holdingId } = input;

    const holding = await db.query(
      `SELECT * FROM holdings WHERE id = $1`,
      [holdingId]
    );

    if (!holding.rows.length) {
      return {
        error: "Holding not found",
      };
    }

    const h = holding.rows[0];

    const nav = await db.query(
      `
      SELECT nav
      FROM fund_navs
      WHERE fund_id = $1
      ORDER BY nav_date DESC
      LIMIT 1
      `,
      [h.fund_id]
    );

    if (!nav.rows.length) {
      return {
        error: "NAV missing",
      };
    }

    const currentNav = Number(
      nav.rows[0].nav
    );

    const currentValue =
      h.units * currentNav;

    const cost =
      h.units * h.purchase_nav;

    const returnPct =
      ((currentValue - cost) / cost) * 100;

    return {
      fundId: h.fund_id,
      currentValue: Number(
        currentValue.toFixed(2)
      ),
      cost: Number(
        cost.toFixed(2)
      ),
      returnPct: Number(
        returnPct.toFixed(2)
      ),
    };
  },
});