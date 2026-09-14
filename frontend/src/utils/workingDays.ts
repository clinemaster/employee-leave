// Simple client-side day-count calculator used ONLY as a labeled "preview"
// while the user fills the form — always defer to the server-computed value
// on submit. Counts every calendar day inclusive of both endpoints,
// including weekends.
export function previewWeekdayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}
