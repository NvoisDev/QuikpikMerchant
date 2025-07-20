-- Customer Account Cleanup Script - Phase 1
-- This script standardizes phone numbers and consolidates duplicate customer accounts

-- Step 1: Standardize phone number formats to +44
UPDATE users 
SET phone_number = CONCAT('+44', SUBSTRING(phone_number, 2))
WHERE phone_number LIKE '0%' 
AND LENGTH(phone_number) = 11
AND phone_number NOT LIKE '+%';

-- Step 2: Add +44 prefix to numbers that start with 44 but don't have +
UPDATE users 
SET phone_number = CONCAT('+', phone_number)
WHERE phone_number LIKE '44%' 
AND LENGTH(phone_number) = 12
AND phone_number NOT LIKE '+%';

-- Step 3: Identify and merge duplicate customers
-- We'll handle this carefully to preserve order history and customer group memberships

-- First, let's create a mapping of duplicates to keep
CREATE TABLE IF NOT EXISTS customer_merge_plan (
  keep_customer_id VARCHAR,
  merge_customer_id VARCHAR,
  reason TEXT,
  orders_to_transfer INT,
  groups_to_transfer INT
);

-- Example merge plan (to be customized based on data analysis):
-- Keep customers with orders and real email addresses
-- Merge duplicates without orders into the primary account

-- Step 4: Create enhanced customer selection function for authentication
-- This will be implemented in the application code to handle:
-- 1. Exact phone number matches first
-- 2. Email verification priority  
-- 3. Order history weighting
-- 4. Last activity recency

-- Future Phase 2: Add email verification table
CREATE TABLE IF NOT EXISTS customer_email_verifications (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  verification_code VARCHAR(6),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

-- Future Phase 3: Customer account profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR NOT NULL UNIQUE,
  preferred_name VARCHAR,
  delivery_addresses JSONB,
  payment_preferences JSONB,
  communication_preferences JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);