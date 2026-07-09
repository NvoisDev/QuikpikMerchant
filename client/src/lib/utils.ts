import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatNumber as _formatNumber } from "@/lib/currencies"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatNumber = _formatNumber;

// Format numbers with commas and decimal places
export function formatNumberWithDecimals(value: number | string, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00';
  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}
