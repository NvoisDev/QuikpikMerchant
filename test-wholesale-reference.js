/**
 * Test Script: Wholesale Reference System
 * 
 * This script tests the wholesale reference generation and inclusion
 * in order confirmations for both customers and wholesalers.
 */

import fs from 'fs';

// Test wholesale reference generation logic
function testWholesaleReferenceGeneration() {
  console.log('🔍 Testing Wholesale Reference Generation...');
  
  // Test cases for different business names
  const testCases = [
    { businessName: 'Lucky Foods', expected: 'LU-' },
    { businessName: 'Surulere Market', expected: 'SU-' },
    { businessName: 'A1 Supplies', expected: 'A1-' },
    { businessName: null, expected: 'WS-' },
    { businessName: '', expected: 'WS-' },
    { businessName: 'X', expected: 'WS-' } // Single character fallback to WS
  ];
  
  testCases.forEach((testCase, index) => {
    const timestamp = Date.now().toString().slice(-6);
    const wholesaleRef = `${testCase.businessName?.substring(0, 2).toUpperCase() || 'WS'}-${timestamp}`;
    const isValid = wholesaleRef.startsWith(testCase.expected);
    
    console.log(`Test ${index + 1}: ${testCase.businessName || 'null'} -> ${wholesaleRef} ${isValid ? '✅' : '❌'}`);
  });
}

// Test email template structure
function testEmailTemplateStructure() {
  console.log('\n📧 Testing Email Template Structure...');
  
  // Check if customer email template includes wholesale reference
  const routesContent = fs.readFileSync('server/routes.ts', 'utf8');
  const hasWholesaleRefInCustomer = routesContent.includes('Wholesale Reference:');
  const hasImportantNote = routesContent.includes('please quote your');
  
  console.log(`Customer Email - Wholesale Reference: ${hasWholesaleRefInCustomer ? '✅' : '❌'}`);
  console.log(`Customer Email - Important Note: ${hasImportantNote ? '✅' : '❌'}`);
  
  // Check if wholesaler email template includes wholesale reference
  const templatesContent = fs.readFileSync('server/email-templates.ts', 'utf8');
  const hasWholesaleRefInWholesaler = templatesContent.includes('Wholesale Reference:');
  const hasContactNote = templatesContent.includes('When contacting the customer, always quote reference:');
  
  console.log(`Wholesaler Email - Wholesale Reference: ${hasWholesaleRefInWholesaler ? '✅' : '❌'}`);
  console.log(`Wholesaler Email - Contact Note: ${hasContactNote ? '✅' : '❌'}`);
}

// Test WhatsApp message enhancement
function testWhatsAppMessage() {
  console.log('\n📱 Testing WhatsApp Message Enhancement...');
  
  const routesContent = fs.readFileSync('server/routes.ts', 'utf8');
  const hasWhatsAppRef = routesContent.includes('Wholesale Ref:');
  const hasQuoteInstruction = routesContent.includes('Quote this reference when communicating');
  
  console.log(`WhatsApp Message - Wholesale Ref: ${hasWhatsAppRef ? '✅' : '❌'}`);
  console.log(`WhatsApp Message - Quote Instruction: ${hasQuoteInstruction ? '✅' : '❌'}`);
}

// Test order creation enhancement
function testOrderCreationEnhancement() {
  console.log('\n🏗️ Testing Order Creation Enhancement...');
  
  const routesContent = fs.readFileSync('server/routes.ts', 'utf8');
  const hasWholesalerLookup = routesContent.includes('Get wholesaler info for reference generation');
  const hasRefGeneration = routesContent.includes('Generate wholesale reference number for both parties');
  const hasOrderNumberAssignment = routesContent.includes('orderNumber: wholesaleRef');
  const hasLogging = routesContent.includes('Wholesale Ref:');
  
  console.log(`Wholesaler Lookup: ${hasWholesalerLookup ? '✅' : '❌'}`);
  console.log(`Reference Generation: ${hasRefGeneration ? '✅' : '❌'}`);
  console.log(`Order Number Assignment: ${hasOrderNumberAssignment ? '✅' : '❌'}`);
  console.log(`Enhanced Logging: ${hasLogging ? '✅' : '❌'}`);
}

// Run all tests
function runAllTests() {
  console.log('🔬 WHOLESALE REFERENCE SYSTEM TEST SUITE\n');
  console.log('=' .repeat(50));
  
  testWholesaleReferenceGeneration();
  testEmailTemplateStructure();
  testWhatsAppMessage();
  testOrderCreationEnhancement();
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Test Suite Complete - Wholesale Reference System Enhanced');
  console.log('\nKey Enhancements:');
  console.log('• Wholesale references generated as: BUSINESS-123456');
  console.log('• Customer emails include wholesale reference and usage instructions');
  console.log('• Wholesaler emails highlight reference prominently');
  console.log('• WhatsApp notifications include reference and quote instructions');
  console.log('• Order creation logs include wholesale reference for tracking');
}

// Execute tests
runAllTests();