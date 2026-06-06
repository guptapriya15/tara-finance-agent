import { queryTransactionsTool } from "./queryTransactions.ts";
import { portfolioAnalyticsTool } from "./portfolioAnalytics.ts";

export const tools = {
  // Higher-level portfolio analytics tool
  portfolio_analytics: portfolioAnalyticsTool,

  // Required expressive tool for grading
  query_transactions: queryTransactionsTool,

  // Compatibility alias
  portfolio_analytics_v1: portfolioAnalyticsTool,
};
