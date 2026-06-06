const STOP_WORDS = new Set([
  "upi",
  "neft",
  "imps",
  "rtgs",
  "txn",
  "payment",
  "pay",
  "paid",
  "transfer",
  "to",
  "from",
  "ref",
  "bank",
  "credit",
  "debit",
]);

export function normalizeMerchant(
  merchant: string
): string {
  if (!merchant) {
    return "unknown";
  }

  const cleaned = merchant
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned
    .split(" ")
    .filter(Boolean)
    .filter((token) => {
      return (
        token.length > 2 &&
        !STOP_WORDS.has(token) &&
        !/^\d+$/.test(token)
      );
    });

  if (tokens.length === 0) {
    return cleaned || "unknown";
  }

  return tokens[0];
}