// Test script to verify session timeout functionality
// This script creates an expired authentication in localStorage and checks if redirect works

console.log("Testing session timeout functionality...");

// Define wholesaler ID used in tests
const wholesalerId = "104871691614680693123";

// Create an expired authentication (older than 24 hours)
const expiredTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
const expiredAuth = {
  isAuthenticated: true,
  customer: {
    id: "test_customer_123",
    name: "Test Customer",
    phone: "+447507659550",
    email: "test@example.com"
  },
  timestamp: expiredTimestamp
};

// Store expired auth in localStorage
localStorage.setItem(`customer_auth_${wholesalerId}`, JSON.stringify(expiredAuth));

console.log("✅ Created expired authentication in localStorage");
console.log("Expired auth timestamp:", new Date(expiredTimestamp).toISOString());
console.log("Current timestamp:", new Date().toISOString());
console.log("Age (hours):", (Date.now() - expiredTimestamp) / (60 * 60 * 1000));

// Now when you navigate to the customer portal, it should redirect to /customer-login
console.log("🔍 Navigate to customer portal to test redirect...");
console.log("Expected behavior: Redirect to /customer-login instead of infinite loading");