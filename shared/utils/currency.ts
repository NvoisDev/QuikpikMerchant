/**
 * Format currency with proper comma separators for amounts over 1000
 * @param amount - The amount to format (string or number)
 * @param currency - The currency code (default: 'GBP')
 * @returns Formatted currency string with £ symbol and comma separators
 */
export const formatCurrency = (amount: string | number, currency: string = 'GBP'): string => {
  if (!amount || amount === "0" || isNaN(Number(amount))) {
    return "£0.00";
  }
  
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Use toLocaleString for proper comma separation and currency formatting
  return numAmount.toLocaleString('en-GB', { 
    style: 'currency', 
    currency: 'GBP',
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
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
 * Format number with comma separators (no currency symbol)
 * @param num - The number to format
 * @returns Formatted number string with commas
 */
export const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString('en-GB');
};