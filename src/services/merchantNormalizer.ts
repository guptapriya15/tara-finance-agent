/**
 * normalizeMerchant
 *
 * Converts a raw merchant string (which may be a display name,
 * UPI handle like "SWIGGY BANGALORE", or a memo fragment) into
 * a stable canonical form used for grouping and fuzzy search.
 *
 * Rules:
 *  1. Lower-case everything.
 *  2. Strip punctuation / special chars → spaces.
 *  3. Remove payment-infrastructure noise tokens (upi, neft, imps, …).
 *  4. Remove pure-numeric tokens (transaction IDs, phone numbers).
 *  5. Join remaining tokens with a single space.
 *  6. Fall back to "unknown" if nothing meaningful survives.
 *
 * We intentionally do NOT truncate to tokens[0] — "swiggy instamart"
 * and "swiggy bangalore" both start with "swiggy", so an ILIKE '%swiggy%'
 * query on merchant_canonical will match both correctly.
 */

const NOISE_TOKENS = new Set([
  "upi", "neft", "imps", "rtgs", "nach",
  "txn", "transaction", "ref", "no",
  "payment", "pay", "paid",
  "transfer", "trf",
  "to", "from", "by", "via",
  "bank", "a/c", "ac",
  "credit", "debit", "cr", "dr",
  "ltd", "pvt", "private", "limited",
  "india", "in",
]);

export function normalizeMerchant(raw: string): string {
  if (!raw || !raw.trim()) return "unknown";

  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length > 1)          // drop single chars
    .filter((t) => !/^\d+$/.test(t))      // drop pure numbers
    .filter((t) => !NOISE_TOKENS.has(t)); // drop payment noise

  if (tokens.length === 0) {
    // fallback: clean original, keep everything
    return raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() || "unknown";
  }

  return tokens.join(" ");
}