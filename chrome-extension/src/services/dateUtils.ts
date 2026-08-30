// Local day helpers — reuse web approach but explicit.
// Do not trust server day; use browser-local timezone.

export function toYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayYYYYMMDD(now = new Date()): string {
  return toYYYYMMDD(now);
}
