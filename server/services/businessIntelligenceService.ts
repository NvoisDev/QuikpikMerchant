import { db } from "../db";
import { orders, orderItems, products, users } from "../../shared/schema";
import { eq, and, desc, gte, sql, count, sum } from "drizzle-orm";

export interface BusinessInsights {
  wholesalerId: string;
  customerAnalytics: {
    totalCustomers: number;
    activeCustomers: number;
    topCustomers: Array<{
      customerId: string;
      customerName: string;
      totalOrders: number;
      totalSpent: string;
      lastOrderDate: string;
    }>;
    atRiskCustomers: Array<{
      customerId: string;
      customerName: string;
      daysSinceLastOrder: number;
    }>;
  };
  productPerformance: {
    topProducts: Array<{
      productId: number;
      productName: string;
      totalSales: string;
      totalQuantity: number;
      orderCount: number;
    }>;
    underperformingProducts: Array<{
      productId: number;
      productName: string;
      stock: number;
      daysSinceLastSale: number;
    }>;
  };
  salesTrends: {
    monthlyRevenue: Array<{
      month: string;
      revenue: string;
      orderCount: number;
    }>;
    growthRate: number;
  };
  recommendations: Array<{
    type: 'pricing' | 'inventory' | 'customer' | 'marketing';
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    estimatedImpact: string;
  }>;
}

export class BusinessIntelligenceService {
  /**
   * Generate comprehensive business insights for a wholesaler
   */
  async generateBusinessInsights(wholesalerId: string): Promise<BusinessInsights> {
    try {
      // Get customer analytics
      const customerAnalytics = await this.getCustomerAnalytics(wholesalerId);
      
      // Get product performance data
      const productPerformance = await this.getProductPerformance(wholesalerId);
      
      // Get sales trends
      const salesTrends = await this.getSalesTrends(wholesalerId);
      
      // Generate actionable recommendations
      const recommendations = this.generateRecommendations(customerAnalytics, productPerformance, salesTrends);

      return {
        wholesalerId,
        customerAnalytics,
        productPerformance,
        salesTrends,
        recommendations
      };

    } catch (error) {
      console.error('Error generating business insights:', error);
      
      // Return empty structure on error
      return {
        wholesalerId,
        customerAnalytics: {
          totalCustomers: 0,
          activeCustomers: 0,
          topCustomers: [],
          atRiskCustomers: []
        },
        productPerformance: {
          topProducts: [],
          underperformingProducts: []
        },
        salesTrends: {
          monthlyRevenue: [],
          growthRate: 0
        },
        recommendations: []
      };
    }
  }

  /**
   * Get customer analytics
   */
  private async getCustomerAnalytics(wholesalerId: string) {
    // Total customers
    const totalCustomersResult = await db
      .select({ count: count(users.id) })
      .from(users)
      .where(eq(users.wholesalerId, wholesalerId));

    const totalCustomers = Number(totalCustomersResult[0]?.count || 0);

    // Active customers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeCustomersResult = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${orders.retailerId})` })
      .from(orders)
      .where(and(
        eq(orders.wholesalerId, wholesalerId),
        gte(orders.createdAt, thirtyDaysAgo)
      ));

    const activeCustomers = Number(activeCustomersResult[0]?.count || 0);

    // Top customers by revenue
    const topCustomers = await db
      .select({
        customerId: users.id,
        customerName: sql<string>`COALESCE(CONCAT(${users.firstName}, ' ', ${users.lastName}), 'Unknown Customer')`,
        totalOrders: count(orders.id),
        totalSpent: sql<string>`COALESCE(FORMAT(SUM(CAST(${orders.total} AS DECIMAL(10,2))), 2), '0.00')`,
        lastOrderDate: sql<string>`MAX(DATE(${orders.createdAt}))`
      })
      .from(users)
      .leftJoin(orders, eq(orders.retailerId, users.id))
      .where(eq(users.wholesalerId, wholesalerId))
      .groupBy(users.id, users.firstName, users.lastName)
      .having(sql`COUNT(${orders.id}) > 0`)
      .orderBy(sql`SUM(CAST(${orders.total} AS DECIMAL(10,2))) DESC`)
      .limit(10);

    // At-risk customers (no order in 60+ days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const atRiskCustomers = await db
      .select({
        customerId: users.id,
        customerName: sql<string>`COALESCE(CONCAT(${users.firstName}, ' ', ${users.lastName}), 'Unknown Customer')`,
        lastOrderDate: sql<string>`MAX(DATE(${orders.createdAt}))`
      })
      .from(users)
      .leftJoin(orders, eq(orders.retailerId, users.id))
      .where(eq(users.wholesalerId, wholesalerId))
      .groupBy(users.id, users.firstName, users.lastName)
      .having(sql`MAX(${orders.createdAt}) < ${sixtyDaysAgo} AND COUNT(${orders.id}) > 0`)
      .limit(20);

    return {
      totalCustomers,
      activeCustomers,
      topCustomers: topCustomers.map(customer => ({
        customerId: customer.customerId,
        customerName: customer.customerName,
        totalOrders: Number(customer.totalOrders),
        totalSpent: customer.totalSpent,
        lastOrderDate: customer.lastOrderDate || 'No orders'
      })),
      atRiskCustomers: atRiskCustomers.map(customer => ({
        customerId: customer.customerId,
        customerName: customer.customerName,
        daysSinceLastOrder: customer.lastOrderDate ? 
          Math.floor((Date.now() - new Date(customer.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)) : 999
      }))
    };
  }

  /**
   * Get product performance analytics
   */
  private async getProductPerformance(wholesalerId: string) {
    // Top performing products
    const topProducts = await db
      .select({
        productId: products.id,
        productName: products.name,
        totalSales: sql<string>`COALESCE(FORMAT(SUM(${orderItems.quantity} * CAST(${orderItems.unitPrice} AS DECIMAL(10,2))), 2), '0.00')`,
        totalQuantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
        orderCount: count(orders.id)
      })
      .from(products)
      .leftJoin(orderItems, eq(orderItems.productId, products.id))
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(products.wholesalerId, wholesalerId))
      .groupBy(products.id, products.name)
      .orderBy(sql`SUM(${orderItems.quantity} * CAST(${orderItems.unitPrice} AS DECIMAL(10,2))) DESC`)
      .limit(10);

    // Underperforming products (high stock, low sales)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const underperformingProducts = await db
      .select({
        productId: products.id,
        productName: products.name,
        stock: products.stock,
        lastSaleDate: sql<string>`MAX(DATE(${orders.createdAt}))`
      })
      .from(products)
      .leftJoin(orderItems, eq(orderItems.productId, products.id))
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(products.wholesalerId, wholesalerId),
        sql`${products.stock} > 50`
      ))
      .groupBy(products.id, products.name, products.stock)
      .having(sql`MAX(${orders.createdAt}) < ${sixtyDaysAgo} OR MAX(${orders.createdAt}) IS NULL`)
      .limit(15);

    return {
      topProducts: topProducts.map(product => ({
        productId: product.productId,
        productName: product.productName,
        totalSales: product.totalSales,
        totalQuantity: Number(product.totalQuantity),
        orderCount: Number(product.orderCount)
      })),
      underperformingProducts: underperformingProducts.map(product => ({
        productId: product.productId,
        productName: product.productName,
        stock: product.stock || 0,
        daysSinceLastSale: product.lastSaleDate ?
          Math.floor((Date.now() - new Date(product.lastSaleDate).getTime()) / (1000 * 60 * 60 * 24)) : 999
      }))
    };
  }

  /**
   * Get sales trends
   */
  private async getSalesTrends(wholesalerId: string) {
    const monthlyRevenue = await db
      .select({
        month: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`,
        revenue: sql<string>`COALESCE(FORMAT(SUM(CAST(${orders.total} AS DECIMAL(10,2))), 2), '0.00')`,
        orderCount: count(orders.id)
      })
      .from(orders)
      .where(eq(orders.wholesalerId, wholesalerId))
      .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m') DESC`)
      .limit(12);

    // Calculate growth rate (current vs previous month)
    let growthRate = 0;
    if (monthlyRevenue.length >= 2) {
      const currentRevenue = parseFloat(monthlyRevenue[0].revenue);
      const previousRevenue = parseFloat(monthlyRevenue[1].revenue);
      if (previousRevenue > 0) {
        growthRate = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
      }
    }

    return {
      monthlyRevenue: monthlyRevenue.map(record => ({
        month: record.month,
        revenue: record.revenue,
        orderCount: Number(record.orderCount)
      })),
      growthRate: Math.round(growthRate * 100) / 100
    };
  }

  /**
   * Generate actionable business recommendations
   */
  private generateRecommendations(customerAnalytics: any, productPerformance: any, salesTrends: any) {
    const recommendations = [];

    // Customer-based recommendations
    if (customerAnalytics.atRiskCustomers.length > 5) {
      recommendations.push({
        type: 'customer' as const,
        title: 'Re-engage At-Risk Customers',
        description: `${customerAnalytics.atRiskCustomers.length} customers haven't ordered recently. Launch a re-engagement campaign with special offers.`,
        priority: 'high' as const,
        estimatedImpact: '15-25% revenue increase from reactivated customers'
      });
    }

    // Product-based recommendations
    if (productPerformance.underperformingProducts.length > 5) {
      recommendations.push({
        type: 'inventory' as const,
        title: 'Clear Slow-Moving Inventory',
        description: `${productPerformance.underperformingProducts.length} products have excess stock. Consider bundle deals or promotional pricing.`,
        priority: 'medium' as const,
        estimatedImpact: '10-20% improvement in inventory turnover'
      });
    }

    // Sales trend-based recommendations
    if (salesTrends.growthRate < 0) {
      recommendations.push({
        type: 'marketing' as const,
        title: 'Revenue Recovery Strategy',
        description: `Revenue has declined by ${Math.abs(salesTrends.growthRate)}%. Focus on top customers and high-margin products.`,
        priority: 'high' as const,
        estimatedImpact: 'Potential to reverse negative growth within 2-3 months'
      });
    } else if (salesTrends.growthRate > 10) {
      recommendations.push({
        type: 'pricing' as const,
        title: 'Optimize Pricing Strategy',
        description: `Strong growth of ${salesTrends.growthRate}% indicates market demand. Consider strategic price increases on popular products.`,
        priority: 'medium' as const,
        estimatedImpact: '5-15% profit margin improvement'
      });
    }

    // Default recommendations if none specific
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'customer' as const,
        title: 'Customer Loyalty Program',
        description: 'Implement a loyalty program to increase customer retention and average order value.',
        priority: 'medium' as const,
        estimatedImpact: '8-12% increase in customer lifetime value'
      });
    }

    return recommendations;
  }
}

export const businessIntelligenceService = new BusinessIntelligenceService();