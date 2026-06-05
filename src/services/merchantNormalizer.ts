export function normalizeMerchant(
  merchant: string
): string {
  let m = merchant.toLowerCase();

  // Remove special characters
  m = m.replace(/[^a-z0-9 ]/g, " ");

  // Remove banking/payment prefixes
  m = m.replace(/\b(upi|neft|imps)\b/g, "");

  // Normalize whitespace
  m = m.replace(/\s+/g, " ").trim();

  if (!m) {
    return "";
  }

  // Use first token as merchant family
  const tokens = m.split(" ").filter(Boolean);

  return tokens[0];
}