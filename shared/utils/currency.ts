/**
 * Locale-independent currency symbol map.
 * Using a hardcoded map avoids relying on Intl/ICU data that may be absent or
 * incomplete in certain Node environments, which would cause toLocaleString to
 * silently fall back to ISO codes (e.g. "GBP 10.00" instead of "£10.00").
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  CHF: 'CHF',
  CNY: '¥',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  NZD: 'NZ$',
  MXN: 'MX$',
  SGD: 'S$',
  HKD: 'HK$',
  INR: '₹',
  BRL: 'R$',
  ZAR: 'R',
  AED: 'د.إ',
  SAR: '﷼',
};

/**
 * Format a number as "1,234.56" without relying on locale APIs.
 */
function formatAmountWithCommas(num: number): string {
  const [intPart, decPart] = num.toFixed(2).split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formattedInt}.${decPart}`;
}

/**
 * Format currency with proper comma separators for amounts over 1000.
 * Uses a locale-independent symbol map so output is consistent regardless of
 * ICU data availability in the server environment.
 * @param amount - The amount to format (string or number)
 * @param currency - The currency code (default: 'GBP')
 * @returns Formatted currency string with the correct symbol and comma separators
 */
export const formatCurrency = (amount: string | number, currency: string = 'GBP'): string => {
  const safeCurrency = (currency || 'GBP').toUpperCase();
  const symbol = getCurrencySymbol(safeCurrency);
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (!amount || amount === '0' || isNaN(numAmount)) {
    return `${symbol}0.00`;
  }

  return `${symbol}${formatAmountWithCommas(numAmount)}`;
};

/**
 * Format percentage with proper decimal places
 * @param percentage - The percentage to format
 * @returns Formatted percentage string
 */
export const formatPercentage = (percentage: number): string => {
  return `${percentage.toFixed(1)}%`;
};

/**
 * Get the currency symbol for a given currency code.
 * Returns from the hardcoded map first; only falls back to Intl when the code
 * is not in the map, so common currencies are always reliable.
 * @param currency - The currency code (e.g. 'GBP', 'USD', 'EUR')
 * @returns The currency symbol (e.g. '£', '$', '€')
 */
export const getCurrencySymbol = (currency: string = 'GBP'): string => {
  const code = (currency || 'GBP').toUpperCase();

  if (CURRENCY_SYMBOLS[code]) {
    return CURRENCY_SYMBOLS[code];
  }

  try {
    return (0)
      .toLocaleString('en-GB', { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0 })
      .replace(/\d/g, '')
      .trim();
  } catch {
    return code;
  }
};

/**
 * Format number with comma separators (no currency symbol).
 * Uses a locale-independent regex approach for consistent output across
 * environments.
 * @param num - The number to format
 * @returns Formatted number string with commas
 */
export const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num, 10) : num;
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
