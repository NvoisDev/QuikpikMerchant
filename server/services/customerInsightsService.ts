import { db } from "../db";
import { orders, orderItems, products, users } from "../../shared/schema";
import { eq, and, desc, gte, sql, count, sum } from "drizzle-orm";

export interface CustomerInsights {
  customerId: string;
  customerName: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate: string | null;
  topProducts: Array<{
    productId: number;
    productName: string;
    totalQuantity: number;
    totalValue: number;
    orderCount: number;
  }>;
  orderingPattern: {
    peakHours: number[];
    preferredDays: string[];
    seasonality: 'consistent' | 'seasonal' | 'sporadic';
  };
  riskLevel: 'low' | 'medium' | 'high';
  loyaltyScore: number; // 0-100
  nextOrderPrediction: {
    estimatedDate: string | null;
    probability: number;
    suggestedProducts: number[];
  };
}

export interface WholesalerGrowthInsights {
  wholesalerId: string;
  totalCustomers: number;
  activeCustomers: number; // Ordered in last 30 days
  atRiskCustomers: Array<{
    customerId: string;
    customerName: string;
    daysSinceLastOrder: number;
    previousOrderFrequency: number;
  }>;
  growthOpportunities: Array<{
    type: 'underperforming_products' | 'seasonal_demand' | 'customer_expansion';
    title: string;
    description: string;
    potentialValue: number;
    actionItems: string[];
  }>;
  monthlyTrends: Array<{
    month: string;
    revenue: number;
    orderCount: number;
    newCustomers: number;
    customerGrowthRate: number;
  }>;
}

export class CustomerInsightsService {
  /**
   * Generate comprehensive insights for a specific customer
   */
  async generateCustomerInsights(customerId: string, wholesalerId: string): Promise<CustomerInsights | null> {
    try {
      // Get customer basic info
      const customer = await db
        .select({
          id: users.id,
          name: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as('name'),
        })
        .from(users)
        .where(eq(users.id, customerId))
        .limit(1);

      if (customer.length === 0) return null;

      const customerData = customer[0];

      // Get order statistics
      const orderStats = await db
        .select({
          totalOrders: count(orders.id),
          totalSpent: sql<number>`COALESCE(SUM(CAST(${orders.totalAmount} AS DECIMAL(10,2))), 0)`.as('totalSpent'),
          lastOrderDate: sql<string>`MAX(${orders.createdAt})`.as('lastOrderDate')
        })
        .from(orders)
        .where(and(
          eq(orders.retailerId, customerId),
          eq(orders.wholesalerId, wholesalerId)
        ));

      const stats = orderStats[0];
      const totalOrders = Number(stats.totalOrders) || 0;
      const totalSpent = Number(stats.totalSpent) || 0;
      const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

      // Get top products
      const topProducts = await db
        .select({
          productId: orderItems.productId,
          productName: products.name,
          totalQuantity: sum(orderItems.quantity),
          totalValue: sum(sql<number>`${orderItems.quantity} * ${orderItems.unitPrice}`),
          orderCount: count(sql<number>`DISTINCT ${orders.id}`)
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(
          eq(orders.retailerId, customerId),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .groupBy(orderItems.productId, products.name)
        .orderBy(desc(sql<number>`SUM(${orderItems.quantity} * ${orderItems.unitPrice})`))
        .limit(5);

      // Analyze ordering patterns
      const orderingPattern = await this.analyzeOrderingPattern(customerId, wholesalerId);

      // Calculate risk level and loyalty score
      const riskLevel = this.calculateRiskLevel(totalOrders, stats.lastOrderDate);
      const loyaltyScore = this.calculateLoyaltyScore(totalOrders, totalSpent, stats.lastOrderDate);

      // Predict next order
      const nextOrderPrediction = await this.predictNextOrder(customerId, wholesalerId);

      return {
        customerId,
        customerName: customerData.name,
        totalOrders,
        totalSpent,
        averageOrderValue,
        lastOrderDate: stats.lastOrderDate,
        topProducts: topProducts.map(p => ({
          productId: p.productId,
          productName: p.productName,
          totalQuantity: Number(p.totalQuantity),
          totalValue: Number(p.totalValue),
          orderCount: Number(p.orderCount)
        })),
        orderingPattern,
        riskLevel,
        loyaltyScore,
        nextOrderPrediction
      };

    } catch (error) {
      console.error('Error generating customer insights:', error);
      return null;
    }
  }

  /**
   * Generate growth insights for a wholesaler
   */
  async generateWholesalerGrowthInsights(wholesalerId: string): Promise<WholesalerGrowthInsights> {
    try {
      // Get customer statistics
      const customerStats = await db
        .select({
          totalCustomers: count(users.id),
        })
        .from(users)
        .where(eq(users.wholesalerId, wholesalerId));

      // Get active customers (ordered in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activeCustomerIds = await db
        .select({ customerId: orders.retailerId })
        .from(orders)
        .where(and(
          eq(orders.wholesalerId, wholesalerId),
          gte(orders.createdAt, thirtyDaysAgo)
        ))
        .groupBy(orders.retailerId);

      // Identify at-risk customers
      const atRiskCustomers = await this.identifyAtRiskCustomers(wholesalerId);

      // Generate growth opportunities
      const growthOpportunities = await this.identifyGrowthOpportunities(wholesalerId);

      // Calculate monthly trends
      const monthlyTrends = await this.calculateMonthlyTrends(wholesalerId);

      return {
        wholesalerId,
        totalCustomers: Number(customerStats[0].totalCustomers),
        activeCustomers: activeCustomerIds.length,
        atRiskCustomers,
        growthOpportunities,
        monthlyTrends
      };

    } catch (error) {
      console.error('Error generating wholesaler growth insights:', error);
      return {
        wholesalerId,
        totalCustomers: 0,
        activeCustomers: 0,
        atRiskCustomers: [],
        growthOpportunities: [],
        monthlyTrends: []
      };
    }
  }

  /**
   * Analyze customer ordering patterns
   */
  private async analyzeOrderingPattern(customerId: string, wholesalerId: string) {
    const orders_data = await db
      .select({
        createdAt: orders.createdAt
      })
      .from(orders)
      .where(and(
        eq(orders.retailerId, customerId),
        eq(orders.wholesalerId, wholesalerId)
      ))
      .orderBy(desc(orders.createdAt));

    // Analyze peak hours and days
    const hourCounts: { [key: number]: number } = {};
    const dayCounts: { [key: string]: number } = {};

    orders_data.forEach(order => {
      const date = new Date(order.createdAt);
      const hour = date.getHours();
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });

      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    // Find peak hours (top 3)
    const peakHours = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    // Find preferred days (top 3)
    const preferredDays = Object.entries(dayCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([day]) => day);

    // Determine seasonality based on order distribution
    const seasonality = this.determineSeasonality(orders_data);

    return {
      peakHours,
      preferredDays,
      seasonality
    };
  }

  /**
   * Calculate customer risk level
   */
  private calculateRiskLevel(totalOrders: number, lastOrderDate: string | null): 'low' | 'medium' | 'high' {
    if (!lastOrderDate) return 'high';

    const daysSinceLastOrder = Math.floor(
      (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastOrder > 60) return 'high';
    if (daysSinceLastOrder > 30 || totalOrders < 3) return 'medium';
    return 'low';
  }

  /**
   * Calculate customer loyalty score (0-100)
   */
  private calculateLoyaltyScore(totalOrders: number, totalSpent: number, lastOrderDate: string | null): number {
    let score = 0;

    // Order frequency score (0-40)
    score += Math.min(totalOrders * 2, 40);

    // Spending score (0-30)
    score += Math.min(totalSpent / 100, 30);

    // Recency score (0-30)
    if (lastOrderDate) {
      const daysSinceLastOrder = Math.floor(
        (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceLastOrder <= 7) score += 30;
      else if (daysSinceLastOrder <= 30) score += 20;
      else if (daysSinceLastOrder <= 60) score += 10;
    }

    return Math.min(Math.round(score), 100);
  }

  /**
   * Predict next order timing and products
   */
  private async predictNextOrder(customerId: string, wholesalerId: string) {
    const recentOrders = await db
      .select({
        createdAt: orders.createdAt
      })
      .from(orders)
      .where(and(
        eq(orders.retailerId, customerId),
        eq(orders.wholesalerId, wholesalerId)
      ))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    if (recentOrders.length < 2) {
      return {
        estimatedDate: null,
        probability: 0,
        suggestedProducts: []
      };
    }

    // Calculate average days between orders
    const intervals: number[] = [];
    for (let i = 0; i < recentOrders.length - 1; i++) {
      const days = Math.floor(
        (new Date(recentOrders[i].createdAt).getTime() - 
         new Date(recentOrders[i + 1].createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(days);
    }

    const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const lastOrderDate = new Date(recentOrders[0].createdAt);
    const estimatedNextDate = new Date(lastOrderDate.getTime() + (averageInterval * 24 * 60 * 60 * 1000));

    // Calculate probability based on consistency
    const variance = intervals.reduce((acc, interval) => acc + Math.pow(interval - averageInterval, 2), 0) / intervals.length;
    const consistency = Math.max(0, 100 - variance);
    const probability = Math.min(consistency, 95);

    // Get frequently ordered products as suggestions
    const suggestedProducts = await db
      .select({
        productId: orderItems.productId
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orders.retailerId, customerId),
        eq(orders.wholesalerId, wholesalerId)
      ))
      .groupBy(orderItems.productId)
      .orderBy(desc(count(orderItems.productId)))
      .limit(5);

    return {
      estimatedDate: estimatedNextDate.toISOString().split('T')[0],
      probability: Math.round(probability),
      suggestedProducts: suggestedProducts.map(p => p.productId)
    };
  }

  /**
   * Determine seasonality pattern
   */
  private determineSeasonality(orders_data: any[]): 'consistent' | 'seasonal' | 'sporadic' {
    if (orders_data.length < 12) return 'sporadic';

    // Group by month and calculate variance
    const monthCounts: { [key: string]: number } = {};
    orders_data.forEach(order => {
      const month = new Date(order.createdAt).toISOString().substring(0, 7); // YYYY-MM
      monthCounts[month] = (monthCounts[month] || 0) + 1;
    });

    const counts = Object.values(monthCounts);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((acc, count) => acc + Math.pow(count - mean, 2), 0) / counts.length;
    
    if (variance < mean * 0.5) return 'consistent';
    if (variance > mean * 2) return 'seasonal';
    return 'sporadic';
  }

  /**
   * Identify customers at risk of churning
   */
  private async identifyAtRiskCustomers(wholesalerId: string) {
    const customers = await db
      .select({
        customerId: users.id,
        customerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`.as('customerName'),
        lastOrderDate: sql<string>`MAX(${orders.createdAt})`.as('lastOrderDate'),
        orderCount: count(orders.id)
      })
      .from(users)
      .leftJoin(orders, and(
        eq(orders.retailerId, users.id),
        eq(orders.wholesalerId, wholesalerId)
      ))
      .where(eq(users.wholesalerId, wholesalerId))
      .groupBy(users.id, users.firstName, users.lastName)
      .having(sql`COUNT(${orders.id}) > 0`);

    return customers
      .map(customer => {
        const daysSinceLastOrder = customer.lastOrderDate 
          ? Math.floor((Date.now() - new Date(customer.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        return {
          customerId: customer.customerId,
          customerName: customer.customerName,
          daysSinceLastOrder,
          previousOrderFrequency: Number(customer.orderCount)
        };
      })
      .filter(customer => customer.daysSinceLastOrder > 30 && customer.previousOrderFrequency >= 3)
      .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder)
      .slice(0, 10);
  }

  /**
   * Identify growth opportunities
   */
  private async identifyGrowthOpportunities(wholesalerId: string) {
    const opportunities = [];

    // Underperforming products
    const lowPerformingProducts = await db
      .select({
        productId: products.id,
        productName: products.name,
        totalSales: sql<number>`COALESCE(SUM(${orderItems.quantity} * ${orderItems.unitPrice}), 0)`.as('totalSales')
      })
      .from(products)
      .leftJoin(orderItems, eq(orderItems.productId, products.id))
      .where(eq(products.wholesalerId, wholesalerId))
      .groupBy(products.id, products.name)
      .having(sql`COALESCE(SUM(${orderItems.quantity} * ${orderItems.unitPrice}), 0) < 100`)
      .limit(5);

    if (lowPerformingProducts.length > 0) {
      opportunities.push({
        type: 'underperforming_products' as const,
        title: 'Boost Underperforming Products',
        description: `${lowPerformingProducts.length} products have low sales. Consider promotions or bundling strategies.`,
        potentialValue: 500,
        actionItems: [
          'Create promotional campaigns for low-performing products',
          'Bundle slow-moving items with popular products',
          'Offer volume discounts to encourage larger orders'
        ]
      });
    }

    return opportunities;
  }

  /**
   * Calculate monthly business trends
   */
  private async calculateMonthlyTrends(wholesalerId: string) {
    const trends = await db
      .select({
        month: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`.as('month'),
        revenue: sum(orders.totalAmount),
        orderCount: count(orders.id),
        newCustomers: sql<number>`COUNT(DISTINCT ${orders.retailerId})`.as('newCustomers')
      })
      .from(orders)
      .where(eq(orders.wholesalerId, wholesalerId))
      .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m') DESC`)
      .limit(12);

    return trends.map((trend, index) => ({
      month: trend.month,
      revenue: Number(trend.revenue),
      orderCount: Number(trend.orderCount),
      newCustomers: Number(trend.newCustomers),
      customerGrowthRate: index < trends.length - 1 
        ? ((Number(trend.newCustomers) - Number(trends[index + 1].newCustomers)) / Number(trends[index + 1].newCustomers)) * 100
        : 0
    }));
  }
}

export const customerInsightsService = new CustomerInsightsService();