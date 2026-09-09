// Simple client-side weekday calculator used ONLY as a labeled "preview"
// while the user fills the form. It does NOT account for gazetted holidays
// (the backend calculator does) — always defer to the server-computed value
// on submit. Counts Mon-Fri inclusive of both endpoints.
export function previewWeekdayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
