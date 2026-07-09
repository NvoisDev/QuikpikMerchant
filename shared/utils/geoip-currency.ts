/**
 * Maps ISO 3166-1 alpha-2 country codes to their primary currency (ISO 4217).
 * Used at wholesaler signup to auto-select a sensible default currency.
 * Existing users are never touched — this only runs for brand-new accounts.
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // English-speaking / common markets
  GB: 'GBP', IM: 'GBP', JE: 'GBP', GG: 'GBP',
  US: 'USD', PR: 'USD', GU: 'USD', VI: 'USD', MP: 'USD', AS: 'USD',
  CA: 'CAD',
  AU: 'AUD', CX: 'AUD', CC: 'AUD', NF: 'AUD', KI: 'AUD', NR: 'AUD', TV: 'AUD',
  NZ: 'NZD', CK: 'NZD', NU: 'NZD', PN: 'NZD', TK: 'NZD',
  // Europe — Euro
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR',
  FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR',
  LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR',
  SI: 'EUR', SK: 'EUR', AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR',
  ME: 'EUR', XK: 'EUR',
  // Europe — non-Euro
  CH: 'CHF', LI: 'CHF',
  SE: 'SEK',
  NO: 'NOK', SJ: 'NOK',
  DK: 'DKK', FO: 'DKK', GL: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
  RS: 'RSD',
  HR: 'HRK',
  // Africa
  NG: 'NGN',
  ZA: 'ZAR', LS: 'ZAR', NA: 'ZAR', SZ: 'ZAR',
  GH: 'GHS',
  KE: 'KES',
  UG: 'UGX',
  TZ: 'TZS',
  RW: 'RWF',
  ET: 'ETB',
  ZM: 'ZMW',
  ZW: 'ZWL',
  EG: 'EGP',
  MA: 'MAD',
  TN: 'TND',
  DZ: 'DZD',
  SN: 'XOF', BJ: 'XOF', BF: 'XOF', CI: 'XOF', GW: 'XOF', ML: 'XOF', NE: 'XOF', TG: 'XOF',
  CM: 'XAF', CF: 'XAF', TD: 'XAF', CG: 'XAF', GQ: 'XAF', GA: 'XAF',
  AO: 'AOA',
  MZ: 'MZN',
  MU: 'MUR',
  // Asia
  JP: 'JPY',
  CN: 'CNY',
  HK: 'HKD',
  SG: 'SGD',
  IN: 'INR',
  PK: 'PKR',
  BD: 'BDT',
  LK: 'LKR',
  NP: 'NPR',
  MY: 'MYR',
  TH: 'THB',
  VN: 'VND',
  PH: 'PHP',
  ID: 'IDR',
  KR: 'KRW',
  TW: 'TWD',
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  KW: 'KWD',
  BH: 'BHD',
  OM: 'OMR',
  JO: 'JOD',
  IL: 'ILS',
  TR: 'TRY',
  // Americas
  MX: 'MXN',
  BR: 'BRL',
  AR: 'ARS',
  CL: 'CLP',
  CO: 'COP',
  PE: 'PEN',
  UY: 'UYU',
  VE: 'VES',
  // Rest
  RU: 'RUB',
  UA: 'UAH',
};

/**
 * Map a 2-letter country code to its default currency.
 * Returns 'GBP' as the safe fallback.
 */
export function currencyFromCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'GBP';
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? 'GBP';
}

/**
 * Detect the visitor's country using the ipapi.co free API, then map to currency.
 * This is called ONCE at new wholesaler signup — never on existing accounts.
 *
 * Safe by design:
 *  - Any network/parse error returns 'GBP' silently (never throws).
 *  - Timeout is capped at 3 seconds so it never stalls signup.
 *
 * @param ip  The IP address string (e.g. from req.ip or X-Forwarded-For).
 *            Pass null/undefined to let ipapi.co auto-detect from the request.
 */
export async function detectCurrencyFromIp(ip?: string | null): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    // ipapi.co: free tier, no API key required for basic country lookup
    const endpoint = ip && ip !== '127.0.0.1' && ip !== '::1'
      ? `https://ipapi.co/${ip}/country/`
      : `https://ipapi.co/country/`;
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return 'GBP';
    const country = (await res.text()).trim().toUpperCase();
    return currencyFromCountry(country);
  } catch {
    return 'GBP';
  }
}
