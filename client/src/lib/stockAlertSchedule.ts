export const ALERT_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function isThisCalendarWeek(date: Date): boolean {
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  const dow = now.getDay();
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  return date >= monday;
}

export function getNextAlertDate(day: number, lastSentAt?: string | null): string {
  const today = new Date();
  const todayDay = today.getDay();
  let daysUntil = day - todayDay;
  if (daysUntil < 0) daysUntil += 7;
  const alreadySentThisWeek = lastSentAt ? isThisCalendarWeek(new Date(lastSentAt)) : false;
  if (daysUntil === 0 && !alreadySentThisWeek) return 'Today';
  const offsetDays = (daysUntil === 0 && alreadySentThisWeek) ? 7 : daysUntil;
  const next = new Date(today);
  next.setDate(today.getDate() + offsetDays);
  return `${ALERT_DAY_NAMES[day]} ${next.getDate()} ${MONTHS_SHORT[next.getMonth()]}`;
}
