import { createTool }
from "@mastra/core/tools";

import { z } from "zod";

import { db }
from "../../../db/client";

import {
  isRecurring,
} from "../../../services/subscriptionDetector";

export const detectSubscriptionsTool =
createTool({
  id: "detect_subscriptions",

  description:
    "Find recurring merchants",

  inputSchema: z.object({}),

  execute: async () => {

    const result =
      await db.query(`
        SELECT
          merchant_canonical,
          transaction_date
        FROM transactions
        WHERE amount > 0
        ORDER BY
          merchant_canonical,
          transaction_date
      `);

    const groups =
      new Map<string, Date[]>();

    for (const row of result.rows) {

      const merchant =
        row.merchant_canonical;

      if (!groups.has(merchant)) {
        groups.set(merchant, []);
      }

      groups
        .get(merchant)!
        .push(
          new Date(
            row.transaction_date
          )
        );
    }

    const recurring: string[] = [];

    for (
      const [merchant, dates]
      of groups
    ) {
      if (
        isRecurring(dates)
      ) {
        recurring.push(
          merchant
        );
      }
    }

    return recurring;
  },
});