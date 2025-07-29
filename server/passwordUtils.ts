import bcrypt from 'bcryptjs';

/**
 * Password utility functions for secure password handling
 */

/**
 * Hash a plain text password using bcrypt
 * @param password - Plain text password to hash
 * @returns Promise<string> - Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12; // Higher salt rounds for better security
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a plain text password against a hashed password
 * @param password - Plain text password to verify
 * @param hashedPassword - Previously hashed password to compare against
 * @returns Promise<boolean> - True if password matches, false otherwise
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

/**
 * Check if a password meets security requirements
 * @param password - Password to validate
 * @returns object with validation result and messages
 */
export function validatePassword(password: string): { isStrong: boolean; messages: string[] } {
  const messages: string[] = [];
  let isStrong = true;

  // Length check
  if (password.length < 8) {
    messages.push('Password must be at least 8 characters long');
    isStrong = false;
  }

  // Character variety checks
  if (!/[a-z]/.test(password)) {
    messages.push('Password must contain at least one lowercase letter');
    isStrong = false;
  }

  if (!/[A-Z]/.test(password)) {
    messages.push('Password must contain at least one uppercase letter');
    isStrong = false;
  }

  if (!/\d/.test(password)) {
    messages.push('Password must contain at least one number');
    isStrong = false;
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    messages.push('Password must contain at least one special character');
    isStrong = false;
  }

  // Common password patterns
  const commonPatterns = ['password', '123456', 'qwerty', 'admin', 'welcome'];
  if (commonPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
    messages.push('Password cannot contain common patterns');
    isStrong = false;
  }

  return { isStrong, messages };
}

/**
 * Generate a secure random password
 * @param length - Desired password length (default: 12)
 * @returns string - Generated password
 */
export function generateSecurePassword(length: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to avoid predictable patterns
  return password.split('').sort(() => Math.random() - 0.5).join('');
}