/**
 * coord.info reports hidden dates as M/D/YYYY. Anything unexpected is passed
 * through untouched so a malformed value never blanks out the field.
 */
export function formatHiddenDate(value: string | null): string | null {
  if (!value) return null;

  const [month, day, year] = value.split('/').map(Number);
  if (!month || !day || !year) return value;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
