/**
 * isRecurring
 *
 * Returns true when the list of transaction dates for a merchant
 * exhibits a recurring pattern.
 *
 * Patterns detected:
 *  - Weekly   : median gap  5–9 days,  ≥3 occurrences
 *  - Biweekly : median gap 12–16 days, ≥3 occurrences
 *  - Monthly  : median gap 25–35 days, ≥3 occurrences
 *  - Quarterly: median gap 85–95 days, ≥2 occurrences
 *
 * We use median (not mean) to be robust against one-off gaps.
 * We also check that the standard deviation is < 10 days so
 * sporadic merchants with occasional repeat visits don't qualify.
 */
export function isRecurring(dates: Date[]): boolean {
  if (dates.length < 2) return false;

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
    gaps.push(diff);
  }

  if (gaps.length === 0) return false;

  const median = percentile(gaps, 50);
  const stdDev = standardDeviation(gaps);

  // Must be reasonably consistent
  if (stdDev > 12) return false;

  const PATTERNS = [
    { min: 5,  max: 9,  minOccurrences: 3 },  // weekly
    { min: 12, max: 16, minOccurrences: 3 },  // biweekly
    { min: 25, max: 35, minOccurrences: 3 },  // monthly
    { min: 85, max: 95, minOccurrences: 2 },  // quarterly
  ];

  return PATTERNS.some(
    (p) =>
      median >= p.min &&
      median <= p.max &&
      sorted.length >= p.minOccurrences
  );
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function standardDeviation(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}