/**
 * Chaser tone thresholds (days overdue).
 * These are the single source of truth used by both the server (getChaserTone)
 * and the client settings preview (getChaserTonePreview).
 */
export const CHASER_TONE_THRESHOLDS = {
  /** Up to and including this many days overdue → 'friendly' tone */
  FRIENDLY_MAX_DAYS: 7,
  /** Up to and including this many days overdue → 'firm' tone (above FRIENDLY_MAX_DAYS) */
  FIRM_MAX_DAYS: 21,
} as const;
