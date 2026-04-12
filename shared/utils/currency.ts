/**
 * Format currency with proper comma separators for amounts over 1000
 * @param amount - The amount to format (string or number)
 * @param currency - The currency code (default: 'GBP')
 * @returns Formatted currency string with the correct symbol and comma separators
 */
export const formatCurrency = (amount: string | number, currency: string = 'GBP'): string => {
  const safeCurrency = currency || 'GBP';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (!amount || amount === "0" || isNaN(numAmount)) {
    try {
      return (0).toLocaleString('en-GB', {
        style: 'currency',
        currency: safeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return '£0.00';
    }
  }

  try {
    return numAmount.toLocaleString('en-GB', {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${numAmount.toFixed(2)}`;
  }
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
 * Get the currency symbol for a given currency code
 * @param currency - The currency code (e.g. 'GBP', 'USD', 'EUR')
 * @returns The currency symbol (e.g. '£', '$', '€')
 */
export const getCurrencySymbol = (currency: string = 'GBP'): string => {
  const code = currency || 'GBP';
  try {
    return (0).toLocaleString('en-GB', { style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: 0 })
      .replace(/\d/g, '').trim();
  } catch {
    if (code === 'USD') return '$';
    if (code === 'EUR') return '€';
    return '£';
  }
};

/**
 * Format number with comma separators (no currency symbol)
 * @param num - The number to format
 * @returns Formatted number string with commas
 */
export const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString('en-GB');
};
