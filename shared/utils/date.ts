/**
 * Locale-independent date formatting utilities.
 * Using a hardcoded month-name array avoids relying on Intl/ICU data that may
 * be absent or incomplete in certain Node environments, ensuring consistent
 * output (e.g. "27 April 2026, 16:05") regardless of the runtime locale.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Format a date as "27 April 2026".
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format a date and time as "27 April 2026, 16:05".
 */
export function formatDateTime(date: Date | string | number): string {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes}`;
}
