import { queryTransactionsTool } from "./finance/queryTransactions";
import { aggregateSpendTool } from "./finance/aggregateSpend";
import { fundReturnTool } from "./finance/fundReturn";
import { holdingReturnTool } from "./finance/holdingReturn";
import { portfolioAnalyticsTool } from "./finance/portfolioAnalytics";

import { searchMerchantTool } from "./finance/searchMerchant";
import { detectSubscriptionsTool } from "./finance/detectSubscriptions";

export const tools = {
  query_transactions: queryTransactionsTool,
  aggregate_spend: aggregateSpendTool,
  fund_return: fundReturnTool,
  holding_return: holdingReturnTool,

  search_merchant: searchMerchantTool,
  detect_subscriptions: detectSubscriptionsTool,
  portfolio_analytics: portfolioAnalyticsTool,
};