export function isRecurring(
  dates: Date[]
): boolean {

  if (dates.length < 3) {
    return false;
  }

  const intervals: number[] = [];

  for (
    let i = 1;
    i < dates.length;
    i++
  ) {
    const diff =
      (dates[i].getTime()
       - dates[i - 1].getTime())
      / 86400000;

    intervals.push(diff);
  }

  const avg =
    intervals.reduce(
      (a, b) => a + b,
      0
    ) / intervals.length;

  return (
    avg >= 25 &&
    avg <= 35
  );
}