import { storage } from "../storage";
import { db } from "../db";
import { orders, orderItems, products } from "../../shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface QuickOrderTemplate {
  id: string;
  name: string;
  customerId: string;
  wholesalerId: string;
  items: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: string;
    sellingType: 'units' | 'pallets';
  }>;
  totalItems: number;
  estimatedTotal: string;
  lastOrderDate: Date;
  orderFrequency: number; // How many times this combination was ordered
}

export interface CustomerOrderPattern {
  productId: number;
  productName: string;
  averageQuantity: number;
  orderCount: number;
  lastOrderDate: Date;
  sellingType: 'units' | 'pallets';
}

export class QuickOrderService {
  
  /**
   * Get quick order templates for a customer based on their order history
   */
  async getQuickOrderTemplates(customerId: string, wholesalerId: string): Promise<QuickOrderTemplate[]> {
    try {
      // Get customer's recent orders (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const customerOrders = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.retailerId, customerId),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .orderBy(desc(orders.createdAt))
        .limit(50);

      if (customerOrders.length === 0) {
        return [];
      }

      // Group orders by similar item combinations
      const orderCombinations = new Map<string, {
        items: any[];
        dates: Date[];
        orderIds: number[];
      }>();

      for (const order of customerOrders) {
        const items = await db
          .select({
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            sellingType: orderItems.sellingType,
            productName: products.name
          })
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, order.id));

        // Create a signature for this order combination
        const signature = items
          .map(item => `${item.productId}-${item.sellingType}`)
          .sort()
          .join(',');

        if (!orderCombinations.has(signature)) {
          orderCombinations.set(signature, {
            items: items,
            dates: [order.createdAt],
            orderIds: [order.id]
          });
        } else {
          const existing = orderCombinations.get(signature)!;
          existing.dates.push(order.createdAt);
          existing.orderIds.push(order.id);
        }
      }

      // Convert to templates, prioritizing frequently ordered combinations
      const templates: QuickOrderTemplate[] = [];
      let templateId = 1;

      for (const [signature, combination] of orderCombinations.entries()) {
        if (combination.dates.length >= 2) { // Only include if ordered at least twice
          const lastOrderDate = new Date(Math.max(...combination.dates.map(d => d.getTime())));
          const estimatedTotal = combination.items.reduce(
            (sum, item) => sum + (parseFloat(item.unitPrice) * item.quantity), 0
          );

          templates.push({
            id: `template-${templateId++}`,
            name: this.generateTemplateName(combination.items),
            customerId,
            wholesalerId,
            items: combination.items.map(item => ({
              productId: item.productId,
              productName: item.productName || 'Unknown Product',
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              sellingType: item.sellingType || 'units'
            })),
            totalItems: combination.items.length,
            estimatedTotal: estimatedTotal.toFixed(2),
            lastOrderDate,
            orderFrequency: combination.dates.length
          });
        }
      }

      // Sort by frequency and recency
      return templates
        .sort((a, b) => {
          // First by frequency (more frequent = higher priority)
          if (b.orderFrequency !== a.orderFrequency) {
            return b.orderFrequency - a.orderFrequency;
          }
          // Then by recency (more recent = higher priority)
          return b.lastOrderDate.getTime() - a.lastOrderDate.getTime();
        })
        .slice(0, 10); // Return top 10 templates

    } catch (error) {
      console.error('❌ Error generating quick order templates:', error);
      return [];
    }
  }

  /**
   * Get frequently ordered products for a customer
   */
  async getFrequentlyOrderedProducts(customerId: string, wholesalerId: string): Promise<CustomerOrderPattern[]> {
    try {
      const customerOrders = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.retailerId, customerId),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .orderBy(desc(orders.createdAt))
        .limit(100);

      if (customerOrders.length === 0) {
        return [];
      }

      // Aggregate product ordering patterns
      const productPatterns = new Map<number, {
        productName: string;
        quantities: number[];
        orderDates: Date[];
        sellingTypes: string[];
      }>();

      for (const order of customerOrders) {
        const items = await db
          .select({
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            sellingType: orderItems.sellingType,
            productName: products.name
          })
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, order.id));

        for (const item of items) {
          if (!productPatterns.has(item.productId)) {
            productPatterns.set(item.productId, {
              productName: item.productName || 'Unknown Product',
              quantities: [item.quantity],
              orderDates: [order.createdAt],
              sellingTypes: [item.sellingType || 'units']
            });
          } else {
            const pattern = productPatterns.get(item.productId)!;
            pattern.quantities.push(item.quantity);
            pattern.orderDates.push(order.createdAt);
            pattern.sellingTypes.push(item.sellingType || 'units');
          }
        }
      }

      // Convert to customer order patterns
      const patterns: CustomerOrderPattern[] = [];

      for (const [productId, pattern] of productPatterns.entries()) {
        if (pattern.quantities.length >= 2) { // Only include if ordered at least twice
          const averageQuantity = Math.round(
            pattern.quantities.reduce((sum, qty) => sum + qty, 0) / pattern.quantities.length
          );
          const lastOrderDate = new Date(Math.max(...pattern.orderDates.map(d => d.getTime())));
          const mostCommonSellingType = this.getMostFrequent(pattern.sellingTypes) as 'units' | 'pallets';

          patterns.push({
            productId,
            productName: pattern.productName,
            averageQuantity,
            orderCount: pattern.quantities.length,
            lastOrderDate,
            sellingType: mostCommonSellingType
          });
        }
      }

      // Sort by order count (most frequently ordered first)
      return patterns
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, 20); // Return top 20 products

    } catch (error) {
      console.error('❌ Error getting frequently ordered products:', error);
      return [];
    }
  }

  /**
   * Create a quick reorder based on the last order
   */
  async getLastOrderForReorder(customerId: string, wholesalerId: string) {
    try {
      const lastOrder = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.retailerId, customerId),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .orderBy(desc(orders.createdAt))
        .limit(1);

      if (lastOrder.length === 0) {
        return null;
      }

      const orderItems = await db
        .select({
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          sellingType: orderItems.sellingType,
          productName: products.name,
          productStock: products.stock,
          productStatus: products.status
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, lastOrder[0].id));

      // Filter out unavailable products and adjust quantities based on current stock
      const availableItems = orderItems.filter(item => 
        item.productStatus === 'active' && item.productStock > 0
      ).map(item => ({
        productId: item.productId,
        productName: item.productName || 'Unknown Product',
        quantity: Math.min(item.quantity, item.productStock || 0),
        unitPrice: item.unitPrice,
        sellingType: item.sellingType || 'units'
      }));

      return {
        orderId: lastOrder[0].id,
        orderNumber: lastOrder[0].orderNumber,
        orderDate: lastOrder[0].createdAt,
        items: availableItems,
        totalItems: availableItems.length,
        originalTotal: lastOrder[0].total
      };

    } catch (error) {
      console.error('❌ Error getting last order for reorder:', error);
      return null;
    }
  }

  /**
   * Generate a descriptive name for an order template
   */
  private generateTemplateName(items: any[]): string {
    if (items.length === 1) {
      return `${items[0].productName} (Regular Order)`;
    } else if (items.length <= 3) {
      const names = items.map(item => item.productName?.split(' ')[0] || 'Item').slice(0, 2);
      return `${names.join(' + ')} Bundle`;
    } else {
      return `${items.length} Items Bundle`;
    }
  }

  /**
   * Get the most frequent value in an array
   */
  private getMostFrequent<T>(arr: T[]): T {
    const frequency: { [key: string]: number } = {};
    let maxCount = 0;
    let mostFrequent = arr[0];

    for (const item of arr) {
      const key = String(item);
      frequency[key] = (frequency[key] || 0) + 1;
      if (frequency[key] > maxCount) {
        maxCount = frequency[key];
        mostFrequent = item;
      }
    }

    return mostFrequent;
  }
}

export const quickOrderService = new QuickOrderService();