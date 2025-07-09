/**
 * Phone number utility functions for international formatting
 */

export function formatPhoneToInternational(phoneNumber: string, defaultCountryCode: string = '+44'): string {
  if (!phoneNumber) return '';
  
  // Remove all non-digit characters except + at the start
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // If it already starts with +, return as is (assuming it's already international)
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Handle UK numbers specifically
  if (defaultCountryCode === '+44') {
    // If it starts with 0, remove it and add +44
    if (cleaned.startsWith('0')) {
      return '+44' + cleaned.substring(1);
    }
    
    // If it starts with 44, add the +
    if (cleaned.startsWith('44')) {
      return '+' + cleaned;
    }
    
    // If it's just digits without country code, assume UK mobile
    if (cleaned.length === 10 || cleaned.length === 11) {
      // Remove leading 0 if present and add +44
      if (cleaned.startsWith('0')) {
        return '+44' + cleaned.substring(1);
      } else {
        return '+44' + cleaned;
      }
    }
  }
  
  // For other country codes, just prepend the default country code
  return defaultCountryCode + cleaned;
}

export function validatePhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber) return false;
  
  // Must start with + and have at least 10 digits
  const phoneRegex = /^\+\d{10,15}$/;
  return phoneRegex.test(phoneNumber);
}

export function formatPhoneForDisplay(phoneNumber: string): string {
  if (!phoneNumber) return '';
  
  // Convert to international format first
  const international = formatPhoneToInternational(phoneNumber);
  
  // Format UK numbers nicely for display
  if (international.startsWith('+44')) {
    const digits = international.substring(3);
    if (digits.length === 10) {
      return `+44 ${digits.substring(0, 4)} ${digits.substring(4, 7)} ${digits.substring(7)}`;
    }
  }
  
  return international;
}

export function isValidUKMobile(phoneNumber: string): boolean {
  const formatted = formatPhoneToInternational(phoneNumber);
  // UK mobile numbers start with +44 7
  return formatted.startsWith('+447') && formatted.length === 13;
}

export function isValidUKLandline(phoneNumber: string): boolean {
  const formatted = formatPhoneToInternational(phoneNumber);
  // UK landline numbers start with +44 1, +44 2, etc. but not +44 7
  return formatted.startsWith('+44') && !formatted.startsWith('+447') && formatted.length >= 12;
}