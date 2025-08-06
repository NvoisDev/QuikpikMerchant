import { storage } from "../storage";

/**
 * Generate a unique order number for a wholesaler
 */
export async function generateOrderNumber(wholesalerId: string): Promise<string> {
  try {
    // Get the wholesaler info to create a prefix
    const wholesaler = await storage.getUser(wholesalerId);
    const businessName = wholesaler?.businessName || 'Store';
    
    // Create a prefix from business name (first 2-3 letters)
    const prefix = businessName
      .replace(/[^a-zA-Z]/g, '')
      .substring(0, 3)
      .toUpperCase() || 'ORD';
    
    // Get current date components
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    
    // Get orders count for today to create sequence
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    // Get today's orders for this wholesaler
    const todaysOrders = await storage.getOrdersByDateRange(wholesalerId, startOfDay, endOfDay);
    const sequence = (todaysOrders.length + 1).toString().padStart(3, '0');
    
    // Format: PREFIX-YYMMDD-SEQ (e.g., SUR-240806-001)
    const orderNumber = `${prefix}-${year}${month}${day}-${sequence}`;
    
    // Verify uniqueness (just in case)
    const existingOrder = await storage.getOrderByNumber(orderNumber);
    if (existingOrder) {
      // If somehow duplicate, add timestamp
      const timestamp = now.getTime().toString().slice(-4);
      return `${prefix}-${year}${month}${day}-${timestamp}`;
    }
    
    return orderNumber;
  } catch (error) {
    console.error('Error generating order number:', error);
    
    // Fallback to timestamp-based number
    const timestamp = Date.now().toString();
    return `ORD-${timestamp.slice(-8)}`;
  }
}