import { db } from "../db";
import { productivityMetrics, orders, customers, products, users } from "../../shared/schema";
import { eq, and, gte, lte, desc, sql, count, sum } from "drizzle-orm";
import { subDays, format, startOfDay, endOfDay } from "date-fns";

interface DailyProductivityData {
  date: string;
  ordersProcessed: number;
  customersAdded: number;
  productsUpdated: number;
  campaignsSent: number;
  loginCount: number;
  sessionDuration: number;
  pagesViewed: number;
  dailyRevenue: number;
  newCustomerRevenue: number;
  productivityScore: number;
}

interface ProductivityPulseData {
  current: DailyProductivityData;
  trend: DailyProductivityData[];
  weeklyComparison: {
    thisWeek: number;
    lastWeek: number;
    percentageChange: number;
  };
  topActivities: Array<{
    activity: string;
    value: number;
    icon: string;
    trend: 'up' | 'down' | 'stable';
  }>;
  engagementLevel: 'low' | 'medium' | 'high';
  suggestions: string[];
}

export class ProductivityPulseService {
  
  async updateDailyMetrics(wholesalerId: string, activityType: string, value: number = 1) {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    try {
      // Try to update existing record
      const [existing] = await db
        .select()
        .from(productivityMetrics)
        .where(
          and(
            eq(productivityMetrics.wholesalerId, wholesalerId),
            eq(productivityMetrics.date, today)
          )
        )
        .limit(1);

      if (existing) {
        // Update existing record
        const updateData = this.getUpdateData(activityType, existing, value);
        
        await db
          .update(productivityMetrics)
          .set({
            ...updateData,
            productivityScore: this.calculateProductivityScore(updateData),
            updatedAt: new Date()
          })
          .where(eq(productivityMetrics.id, existing.id));
      } else {
        // Create new record
        const newData = this.getNewRecordData(activityType, value);
        
        await db
          .insert(productivityMetrics)
          .values({
            wholesalerId,
            date: today,
            ...newData,
            productivityScore: this.calculateProductivityScore(newData)
          });
      }
    } catch (error) {
      console.error('Error updating productivity metrics:', error);
    }
  }

  async getProductivityPulse(wholesalerId: string): Promise<ProductivityPulseData> {
    const today = new Date();
    const sevenDaysAgo = subDays(today, 7);
    const fourteenDaysAgo = subDays(today, 14);

    // Get recent metrics
    const recentMetrics = await db
      .select()
      .from(productivityMetrics)
      .where(
        and(
          eq(productivityMetrics.wholesalerId, wholesalerId),
          gte(productivityMetrics.date, format(sevenDaysAgo, 'yyyy-MM-dd'))
        )
      )
      .orderBy(desc(productivityMetrics.date));

    // Get today's metrics or create default
    const todayFormatted = format(today, 'yyyy-MM-dd');
    let currentMetrics = recentMetrics.find(m => m.date === todayFormatted);
    
    if (!currentMetrics) {
      // Create today's record with current data
      await this.generateTodayMetrics(wholesalerId);
      currentMetrics = await this.getTodayMetrics(wholesalerId);
    }

    // Calculate weekly comparison
    const thisWeekScore = this.calculateWeeklyAverage(recentMetrics);
    const lastWeekMetrics = await this.getLastWeekMetrics(wholesalerId, fourteenDaysAgo, sevenDaysAgo);
    const lastWeekScore = this.calculateWeeklyAverage(lastWeekMetrics);
    
    const percentageChange = lastWeekScore > 0 
      ? ((thisWeekScore - lastWeekScore) / lastWeekScore) * 100 
      : 0;

    // Determine engagement level
    const engagementLevel = this.determineEngagementLevel(currentMetrics.productivityScore);

    // Generate suggestions
    const suggestions = this.generateSuggestions(currentMetrics, recentMetrics);

    // Get top activities with trends
    const topActivities = this.getTopActivities(currentMetrics, recentMetrics);

    return {
      current: this.formatMetricData(currentMetrics),
      trend: recentMetrics.map(m => this.formatMetricData(m)),
      weeklyComparison: {
        thisWeek: Math.round(thisWeekScore),
        lastWeek: Math.round(lastWeekScore),
        percentageChange: Math.round(percentageChange)
      },
      topActivities,
      engagementLevel,
      suggestions
    };
  }

  private async generateTodayMetrics(wholesalerId: string) {
    const today = new Date();
    const startDay = startOfDay(today);
    const endDay = endOfDay(today);

    // Get real data for today
    const [orderCount] = await db
      .select({ count: count() })
      .from(orders)
      .where(
        and(
          eq(orders.wholesalerId, wholesalerId),
          gte(orders.createdAt, startDay),
          lte(orders.createdAt, endDay)
        )
      );

    const [customerCount] = await db
      .select({ count: count() })
      .from(customers)
      .where(
        and(
          eq(customers.wholesalerId, wholesalerId),
          gte(customers.createdAt, startDay),
          lte(customers.createdAt, endDay)
        )
      );

    const [revenueData] = await db
      .select({ 
        total: sum(sql`CAST(${orders.totalPrice} AS DECIMAL)`) 
      })
      .from(orders)
      .where(
        and(
          eq(orders.wholesalerId, wholesalerId),
          eq(orders.status, 'completed'),
          gte(orders.createdAt, startDay),
          lte(orders.createdAt, endDay)
        )
      );

    const todayData = {
      ordersProcessed: orderCount.count || 0,
      customersAdded: customerCount.count || 0,
      productsUpdated: 0, // This would need session tracking
      campaignsSent: 0, // This would need campaign tracking
      loginCount: 1, // Assume at least one login to see the widget
      sessionDuration: 30, // Default session time
      pagesViewed: 5, // Default page views
      dailyRevenue: Number(revenueData.total) || 0,
      newCustomerRevenue: 0 // Would need additional tracking
    };

    await db
      .insert(productivityMetrics)
      .values({
        wholesalerId,
        date: format(today, 'yyyy-MM-dd'),
        ...todayData,
        productivityScore: this.calculateProductivityScore(todayData)
      })
      .onConflictDoUpdate({
        target: [productivityMetrics.wholesalerId, productivityMetrics.date],
        set: {
          ...todayData,
          productivityScore: this.calculateProductivityScore(todayData),
          updatedAt: new Date()
        }
      });
  }

  private async getTodayMetrics(wholesalerId: string) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [metric] = await db
      .select()
      .from(productivityMetrics)
      .where(
        and(
          eq(productivityMetrics.wholesalerId, wholesalerId),
          eq(productivityMetrics.date, today)
        )
      )
      .limit(1);
    
    return metric;
  }

  private async getLastWeekMetrics(wholesalerId: string, start: Date, end: Date) {
    return await db
      .select()
      .from(productivityMetrics)
      .where(
        and(
          eq(productivityMetrics.wholesalerId, wholesalerId),
          gte(productivityMetrics.date, format(start, 'yyyy-MM-dd')),
          lte(productivityMetrics.date, format(end, 'yyyy-MM-dd'))
        )
      );
  }

  private getUpdateData(activityType: string, existing: any, value: number) {
    const updates: any = {};
    
    switch (activityType) {
      case 'order_processed':
        updates.ordersProcessed = (existing.ordersProcessed || 0) + value;
        break;
      case 'customer_added':
        updates.customersAdded = (existing.customersAdded || 0) + value;
        break;
      case 'product_updated':
        updates.productsUpdated = (existing.productsUpdated || 0) + value;
        break;
      case 'campaign_sent':
        updates.campaignsSent = (existing.campaignsSent || 0) + value;
        break;
      case 'login':
        updates.loginCount = (existing.loginCount || 0) + 1;
        break;
      case 'page_view':
        updates.pagesViewed = (existing.pagesViewed || 0) + 1;
        break;
      case 'session_time':
        updates.sessionDuration = (existing.sessionDuration || 0) + value;
        break;
      case 'revenue':
        updates.dailyRevenue = Number(existing.dailyRevenue || 0) + value;
        break;
    }
    
    return updates;
  }

  private getNewRecordData(activityType: string, value: number) {
    const data = {
      ordersProcessed: 0,
      customersAdded: 0,
      productsUpdated: 0,
      campaignsSent: 0,
      loginCount: 0,
      sessionDuration: 0,
      pagesViewed: 0,
      dailyRevenue: 0,
      newCustomerRevenue: 0
    };

    switch (activityType) {
      case 'order_processed':
        data.ordersProcessed = value;
        break;
      case 'customer_added':
        data.customersAdded = value;
        break;
      case 'product_updated':
        data.productsUpdated = value;
        break;
      case 'campaign_sent':
        data.campaignsSent = value;
        break;
      case 'login':
        data.loginCount = 1;
        break;
      case 'page_view':
        data.pagesViewed = 1;
        break;
      case 'session_time':
        data.sessionDuration = value;
        break;
      case 'revenue':
        data.dailyRevenue = value;
        break;
    }

    return data;
  }

  private calculateProductivityScore(data: any): number {
    // Weighted scoring system (0-100)
    const weights = {
      orders: 25,
      customers: 20,
      products: 15,
      campaigns: 15,
      engagement: 25 // login + session + pages
    };

    // Normalize values (assume reasonable daily targets)
    const orderScore = Math.min((data.ordersProcessed || 0) / 5, 1) * weights.orders;
    const customerScore = Math.min((data.customersAdded || 0) / 3, 1) * weights.customers;
    const productScore = Math.min((data.productsUpdated || 0) / 10, 1) * weights.products;
    const campaignScore = Math.min((data.campaignsSent || 0) / 2, 1) * weights.campaigns;
    
    // Engagement score combines login frequency, session time, and page views
    const engagementScore = Math.min(
      ((data.loginCount || 0) / 3 + 
       (data.sessionDuration || 0) / 120 + 
       (data.pagesViewed || 0) / 20) / 3,
      1
    ) * weights.engagement;

    return Math.round(orderScore + customerScore + productScore + campaignScore + engagementScore);
  }

  private calculateWeeklyAverage(metrics: any[]): number {
    if (metrics.length === 0) return 0;
    const sum = metrics.reduce((acc, m) => acc + (m.productivityScore || 0), 0);
    return sum / metrics.length;
  }

  private determineEngagementLevel(score: number): 'low' | 'medium' | 'high' {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  private formatMetricData(metric: any): DailyProductivityData {
    return {
      date: metric.date,
      ordersProcessed: metric.ordersProcessed || 0,
      customersAdded: metric.customersAdded || 0,
      productsUpdated: metric.productsUpdated || 0,
      campaignsSent: metric.campaignsSent || 0,
      loginCount: metric.loginCount || 0,
      sessionDuration: metric.sessionDuration || 0,
      pagesViewed: metric.pagesViewed || 0,
      dailyRevenue: Number(metric.dailyRevenue) || 0,
      newCustomerRevenue: Number(metric.newCustomerRevenue) || 0,
      productivityScore: metric.productivityScore || 0
    };
  }

  private getTopActivities(current: any, recent: any[]) {
    const activities = [
      {
        activity: 'Orders Processed',
        value: current.ordersProcessed || 0,
        icon: 'ShoppingCart',
        trend: this.getTrend('ordersProcessed', current, recent)
      },
      {
        activity: 'Customers Added',
        value: current.customersAdded || 0,
        icon: 'Users',
        trend: this.getTrend('customersAdded', current, recent)
      },
      {
        activity: 'Products Updated',
        value: current.productsUpdated || 0,
        icon: 'Package',
        trend: this.getTrend('productsUpdated', current, recent)
      },
      {
        activity: 'Revenue Generated',
        value: Number(current.dailyRevenue) || 0,
        icon: 'DollarSign',
        trend: this.getTrend('dailyRevenue', current, recent)
      }
    ];

    return activities.sort((a, b) => b.value - a.value);
  }

  private getTrend(field: string, current: any, recent: any[]): 'up' | 'down' | 'stable' {
    const yesterday = recent.find(m => m.date !== current.date);
    if (!yesterday) return 'stable';

    const currentValue = Number(current[field]) || 0;
    const yesterdayValue = Number(yesterday[field]) || 0;

    if (currentValue > yesterdayValue) return 'up';
    if (currentValue < yesterdayValue) return 'down';
    return 'stable';
  }

  private generateSuggestions(current: any, recent: any[]): string[] {
    const suggestions: string[] = [];
    const score = current.productivityScore || 0;

    if (score < 30) {
      suggestions.push("Consider setting daily goals to boost your productivity");
      suggestions.push("Try processing a few orders to increase your activity score");
    } else if (score < 60) {
      suggestions.push("You're doing well! Adding a few customers could boost your score");
      suggestions.push("Update product information to keep your catalog fresh");
    } else {
      suggestions.push("Excellent productivity! Keep up the great work");
      suggestions.push("Consider sharing your success with team members");
    }

    // Activity-specific suggestions
    if ((current.customersAdded || 0) === 0) {
      suggestions.push("Add new customers to expand your business reach");
    }

    if ((current.campaignsSent || 0) === 0) {
      suggestions.push("Send marketing campaigns to engage your customers");
    }

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }
}

export const productivityPulseService = new ProductivityPulseService();