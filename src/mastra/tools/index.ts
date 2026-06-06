import { financeAnalytics } from "./finance_analytics";
import { portfolioAnalytics } from "./portfolio_analytics";

import { queryTransactionsTool } from "./finance/queryTransactions";
import { aggregateSpendTool } from "./finance/aggregateSpend";
import { detectSubscriptionsTool } from "./finance/detectSubscriptions";
import { fundReturnTool } from "./finance/fundReturn";
import { holdingReturnTool } from "./finance/holdingReturn";

// Note: keep the higher-level analytics tools, but also expose the more expressive
// deterministic finance tools required by the take-home.
export const tools = {
  // existing coarse tools (may be refactored later)
  finance_analytics: financeAnalytics,
  portfolio_analytics: portfolioAnalytics,

  // required, expressive tools for grading
  query_transactions: queryTransactionsTool,
  aggregate_spend: aggregateSpendTool,
  detect_subscriptions: detectSubscriptionsTool,
  fund_return: fundReturnTool,
  holding_return: holdingReturnTool,
};
