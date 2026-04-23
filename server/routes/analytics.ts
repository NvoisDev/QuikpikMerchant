import type { Express } from "express";
import {
  and, count, customerGroups, db, eq, gte, inArray, lte, openai, or, orderCancellationRequests,
  orderItems, orders, products, requireAuth, requireNotViewer, storage, sum
} from "./shared";
import { productBatches } from "@shared/schema";

export function registerAnalyticsRoutes(app: Express): void {
  // GET /api/analytics/cancellations
  app.get('/api/analytics/cancellations', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { timeRange = '30d' } = req.query;
      const now = new Date();
      let startDate: Date;
      
      switch (timeRange) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      
      // Get all cancelled orders
      const allOrders = await storage.getOrders(wholesalerId);
      const cancelledOrders = allOrders.filter(o => 
        o.status === 'cancelled' && new Date(o.createdAt) >= startDate
      );
      
      // Get cancellation requests
      const requests = await db.select()
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.wholesalerId, wholesalerId),
          gte(orderCancellationRequests.requestedAt, startDate)
        ));
      
      // Calculate metrics
      const totalCancelled = cancelledOrders.length;
      const totalRefunded = cancelledOrders.reduce((sum, o) => sum + parseFloat(o.amountRefunded || '0'), 0);
      const totalValue = cancelledOrders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
      
      // Cancellation reason breakdown
      const reasonBreakdown: Record<string, number> = {};
      cancelledOrders.forEach(o => {
        const reason = o.refundReason?.split(':')[0]?.trim() || 'Unknown';
        reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
      });
      
      // Customer-initiated vs wholesaler-initiated
      const customerInitiated = requests.filter(r => r.status === 'approved').length;
      const wholesalerInitiated = totalCancelled - customerInitiated;
      
      // Pending requests
      const pendingRequests = requests.filter(r => r.status === 'pending').length;
      const approvedRequests = requests.filter(r => r.status === 'approved').length;
      const rejectedRequests = requests.filter(r => r.status === 'rejected').length;
      
      // Calculate cancellation rate
      const totalOrders = allOrders.filter(o => new Date(o.createdAt) >= startDate).length;
      const cancellationRate = totalOrders > 0 ? (totalCancelled / totalOrders * 100).toFixed(1) : '0';
      
      res.json({
        totalCancelled,
        totalRefunded: totalRefunded.toFixed(2),
        totalValue: totalValue.toFixed(2),
        cancellationRate,
        reasonBreakdown: Object.entries(reasonBreakdown).map(([reason, count]) => ({ reason, count })),
        initiatedBy: {
          customer: customerInitiated,
          wholesaler: wholesalerInitiated
        },
        requests: {
          pending: pendingRequests,
          approved: approvedRequests,
          rejected: rejectedRequests,
          total: requests.length
        }
      });
    } catch (error) {
      console.error("Error fetching cancellation analytics:", error);
      res.status(500).json({ message: "Failed to fetch cancellation analytics" });
    }
  });

  // GET /api/analytics/stats
  app.get('/api/analytics/stats', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { fromDate, toDate } = req.query;
      
      let stats;
      if (fromDate && toDate) {
        stats = await storage.getWholesalerStatsForDateRange(targetUserId, new Date(fromDate), new Date(toDate));
      } else {
        stats = await storage.getWholesalerStats(targetUserId);
      }
      
      // Calculate WhatsApp reach from broadcasts
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      const whatsappReach = broadcastStats.recipientsReached || 0;
      
      // Get total customer count for calculating coverage
      const customerGroups = await storage.getCustomerGroups(targetUserId);
      const totalCustomers = customerGroups.reduce((total, group) => total + 0, 0); // memberCount not available in schema
      
      res.json({
        ...stats,
        whatsappReach,
        customerCount: totalCustomers
      });
    } catch (error) {
      console.error("Error fetching analytics stats:", error);
      res.status(500).json({ message: "Failed to fetch analytics stats" });
    }
  });

  // GET /api/analytics/chart-data
  app.get('/api/analytics/chart-data', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { fromDate, toDate } = req.query;
      
      if (!fromDate || !toDate) {
        return res.status(400).json({ message: "fromDate and toDate are required" });
      }
      
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      const now = new Date();
      
      // Ensure endDate doesn't exceed current time
      const actualEndDate = endDate > now ? now : endDate;
      
      // Get orders within the date range
      const orders = await storage.getOrdersForDateRange(targetUserId, startDate, actualEndDate);
      
      // Calculate time span to determine chart granularity
      const hoursDifference = (actualEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      
      let chartData = [];

      if (hoursDifference <= 24) {
        // Hourly — today or yesterday
        const currentHour = now.getHours();
        const isToday = actualEndDate.toDateString() === now.toDateString();
        const maxHour = isToday ? currentHour : 23;

        for (let hour = 0; hour <= maxHour; hour++) {
          const hourStart = new Date(startDate);
          hourStart.setHours(hour, 0, 0, 0);
          const hourEnd = new Date(startDate);
          hourEnd.setHours(hour, 59, 59, 999);

          const hourOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= hourStart && orderDate <= hourEnd;
          });

          chartData.push({
            name: `${hour}:00`,
            revenue: Math.round(hourOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: hourOrders.length
          });
        }
      } else if (hoursDifference <= 168) {
        // Daily with weekday names — 2 to 7 days
        const daysDiff = Math.ceil(hoursDifference / 24);
        for (let i = 0; i < daysDiff; i++) {
          const dayStart = new Date(startDate);
          dayStart.setDate(startDate.getDate() + i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          if (dayStart > now) break;

          const dayOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= dayStart && orderDate <= dayEnd;
          });

          chartData.push({
            name: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
            revenue: Math.round(dayOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: dayOrders.length
          });
        }
      } else if (hoursDifference <= 744) {
        // Daily with date labels — 8 to 31 days
        const daysDiff = Math.ceil(hoursDifference / 24);
        for (let i = 0; i < daysDiff; i++) {
          const dayStart = new Date(startDate);
          dayStart.setDate(startDate.getDate() + i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          if (dayStart > now) break;

          const dayOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= dayStart && orderDate <= dayEnd;
          });

          chartData.push({
            name: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: Math.round(dayOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: dayOrders.length
          });
        }
      } else if (hoursDifference <= 2190) {
        // Weekly buckets with date label — 32 to 90 days
        const weeks = Math.ceil(hoursDifference / (24 * 7));
        for (let i = 0; i < weeks; i++) {
          const weekStart = new Date(startDate);
          weekStart.setDate(startDate.getDate() + (i * 7));
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);

          if (weekStart > now) break;

          const weekOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= weekStart && orderDate <= weekEnd;
          });

          chartData.push({
            name: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: Math.round(weekOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: weekOrders.length
          });
        }
      } else {
        // Monthly buckets — 90+ days
        const spanYears = actualEndDate.getFullYear() - startDate.getFullYear();
        const multiYear = spanYears >= 1;
        let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

        while (cursor <= actualEndDate) {
          if (cursor > now) break;

          const monthStart = new Date(cursor);
          const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

          const monthOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= monthStart && orderDate <= monthEnd;
          });

          const label = multiYear
            ? monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            : monthStart.toLocaleDateString('en-US', { month: 'short' });

          chartData.push({
            name: label,
            revenue: Math.round(monthOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: monthOrders.length
          });

          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
      }
      
      res.json(chartData);
    } catch (error) {
      console.error("Error fetching chart data:", error);
      res.status(500).json({ message: "Failed to fetch chart data" });
    }
  });

  // GET /api/analytics/top-products
  app.get('/api/analytics/top-products', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { limit } = req.query;
      const topProducts = await storage.getTopProducts(targetUserId, limit ? parseInt(limit as string) : 5);
      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).json({ message: "Failed to fetch top products" });
    }
  });

  // GET /api/analytics/recent-orders
  app.get('/api/analytics/recent-orders', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { limit } = req.query;
      const recentOrders = await storage.getRecentOrders(targetUserId, limit ? parseInt(limit as string) : 10);
      res.json(recentOrders);
    } catch (error) {
      console.error("Error fetching recent orders:", error);
      res.status(500).json({ message: "Failed to fetch recent orders" });
    }
  });

  // GET /api/analytics/broadcast-stats
  app.get('/api/analytics/broadcast-stats', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      res.json(broadcastStats);
    } catch (error) {
      console.error("Error fetching broadcast stats:", error);
      res.status(500).json({ message: "Failed to fetch broadcast stats" });
    }
  });

  // GET /api/analytics/margin-summary
  app.get('/api/analytics/margin-summary', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const { fromDate, toDate } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({ message: "fromDate and toDate are required" });
      }

      const startDate = new Date(fromDate as string);
      const endDate = new Date(toDate as string);

      const ordersInRange = await db
        .select({ id: orders.id, isQuote: orders.isQuote, status: orders.status })
        .from(orders)
        .where(and(
          eq(orders.wholesalerId, targetUserId),
          gte(orders.createdAt, startDate),
          lte(orders.createdAt, endDate),
        ));

      const validOrders = ordersInRange.filter(o => o.status !== 'cancelled');

      const empty = { revenue: 0, cost: 0, margin: 0, marginPercent: 0, hasMissingCost: false };
      if (validOrders.length === 0) {
        return res.json({ quotes: { ...empty }, online: { ...empty }, total: { ...empty } });
      }

      const orderIds = validOrders.map(o => o.id);

      const items = await db
        .select({
          orderId: orderItems.orderId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          batchId: orderItems.batchId,
          costPrice: productBatches.costPrice,
        })
        .from(orderItems)
        .leftJoin(productBatches, eq(orderItems.batchId, productBatches.id))
        .where(inArray(orderItems.orderId, orderIds));

      const orderQuoteMap = new Map(validOrders.map(o => [o.id, o.isQuote ?? false]));

      let quotesRevenue = 0, quotesCost = 0, quotesMissingCost = false;
      let onlineRevenue = 0, onlineCost = 0, onlineMissingCost = false;

      for (const item of items) {
        const isQuote = orderQuoteMap.get(item.orderId) ?? false;
        const hasCost = item.batchId !== null && item.costPrice !== null && item.costPrice !== undefined;

        if (!hasCost) {
          // Mark missing cost but exclude this item entirely from margin arithmetic
          if (isQuote) { quotesMissingCost = true; } else { onlineMissingCost = true; }
          continue;
        }

        const revenue = parseFloat(item.unitPrice) * item.quantity;
        const cost = parseFloat(item.costPrice!) * item.quantity;

        if (isQuote) {
          quotesRevenue += revenue;
          quotesCost += cost;
        } else {
          onlineRevenue += revenue;
          onlineCost += cost;
        }
      }

      const calcMetrics = (revenue: number, cost: number, hasMissingCost: boolean) => {
        const margin = revenue - cost;
        const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
        return {
          revenue: Math.round(revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: Math.round(marginPercent * 10) / 10,
          hasMissingCost,
        };
      };

      const totalRevenue = quotesRevenue + onlineRevenue;
      const totalCost = quotesCost + onlineCost;

      res.json({
        quotes: calcMetrics(quotesRevenue, quotesCost, quotesMissingCost),
        online: calcMetrics(onlineRevenue, onlineCost, onlineMissingCost),
        total: calcMetrics(totalRevenue, totalCost, quotesMissingCost || onlineMissingCost),
      });
    } catch (error) {
      console.error("Error fetching margin summary:", error);
      res.status(500).json({ message: "Failed to fetch margin summary" });
    }
  });

  // GET /api/analytics/dashboard
  app.get('/api/analytics/dashboard', requireAuth, async (req: any, res) => {
    try {
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { timeRange = '30d' } = req.query;
      
      const stats = await storage.getWholesalerStats(targetUserId);
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      
      // Calculate change percentages (simplified - would need historical data)
      const analyticsData = {
        revenue: {
          total: stats.totalRevenue,
          change: 12.5, // Mock change percentage
          trend: []
        },
        orders: {
          total: stats.ordersCount,
          change: 8.3,
          trend: []
        },
        customers: {
          total: 25,
          new: 5,
          returning: 20,
          trend: []
        },
        products: {
          active: stats.activeProducts,
          lowStock: stats.lowStockCount,
          topPerformers: []
        },
        geography: [
          { region: "London", orders: 15, revenue: 1250 },
          { region: "Manchester", orders: 8, revenue: 680 },
          { region: "Birmingham", orders: 5, revenue: 420 }
        ],
        channels: [
          { channel: "WhatsApp", orders: 18, revenue: 1500 },
          { channel: "Direct", orders: 10, revenue: 850 }
        ],
        broadcasts: {
          sent: broadcastStats.totalBroadcasts,
          delivered: broadcastStats.recipientsReached,
          opened: Math.floor(broadcastStats.recipientsReached * 0.7),
          clicked: Math.floor(broadcastStats.recipientsReached * 0.3)
        }
      };
      
      res.json(analyticsData);
    } catch (error) {
      console.error("Error fetching analytics dashboard:", error);
      res.status(500).json({ message: "Failed to fetch analytics dashboard" });
    }
  });

  // GET /api/analytics/revenue
  app.get('/api/analytics/revenue', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { timeRange = '30d' } = req.query;
      
      // Generate sample revenue trend data
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const revenueData = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        revenueData.push({
          date: date.toISOString().split('T')[0],
          amount: Math.floor(Math.random() * 200) + 50
        });
      }
      
      res.json(revenueData);
    } catch (error) {
      console.error("Error fetching revenue data:", error);
      res.status(500).json({ message: "Failed to fetch revenue data" });
    }
  });

  // GET /api/analytics/products
  app.get('/api/analytics/products', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const topProducts = await storage.getTopProducts(targetUserId, 10);
      
      // Format for chart display
      const productPerformance = topProducts.map(product => ({
        name: product.name.substring(0, 15) + (product.name.length > 15 ? '...' : ''),
        orders: product.orderCount,
        revenue: product.revenue
      }));
      
      res.json(productPerformance);
    } catch (error) {
      console.error("Error fetching product performance:", error);
      res.status(500).json({ message: "Failed to fetch product performance" });
    }
  });

  // GET /api/financial-health
  app.get('/api/financial-health', requireAuth, async (req: any, res) => {
    try {
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

      const userId = req.user.id;
      const period = req.query.period || '3months';
      
      // Get comprehensive financial data
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrders(userId),
        storage.getProducts(userId)
      ]);

      // Calculate key metrics using actual order data
      const totalRevenue = stats.totalRevenue || 0;
      const totalCosts = orders.reduce((sum: number, order: any) => {
        return sum + (parseFloat(order.total) * 0.7);
      }, 0); // Estimated costs
      const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue * 100) : 0;
      const revenueGrowth = 12.5; // Default growth rate for demo
      
      // Calculate customer metrics
      const uniqueCustomers = new Set(orders.map((o: any) => o.retailerId)).size;
      const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
      const customerLifetimeValue = avgOrderValue * 3; // Simplified LTV calculation
      const customerAcquisitionCost = uniqueCustomers > 0 ? (totalRevenue * 0.1) / uniqueCustomers : 0;
      
      // Calculate burn rate (monthly expenses)
      const monthlyBurnRate = totalCosts / 3; // Simplified monthly burn
      const monthsOfRunway = monthlyBurnRate > 0 ? (totalRevenue - totalCosts) / monthlyBurnRate : 12;

      // Calculate health score components
      const revenueScore = Math.min(90, Math.max(10, revenueGrowth + 50));
      const profitabilityScore = Math.min(90, Math.max(10, profitMargin * 2));
      const cashFlowScore = Math.min(90, Math.max(10, monthsOfRunway * 10));
      const growthScore = Math.min(90, Math.max(10, (orders.length / 30) * 20 + 40));
      const efficiencyScore = Math.min(90, Math.max(10, (products.filter((p: any) => p.status === 'active').length / Math.max(products.length, 1)) * 100));

      const healthScore = Math.round((revenueScore + profitabilityScore + cashFlowScore + growthScore + efficiencyScore) / 5);

      // Generate AI insights (simplified for demo)
      const insights = {
        summary: `Your business shows ${healthScore >= 70 ? 'strong' : healthScore >= 50 ? 'moderate' : 'concerning'} financial health with a score of ${healthScore}/100. ${totalRevenue > 1000 ? 'Revenue performance is solid' : 'Focus on revenue growth opportunities'}.`,
        recommendations: [
          "Optimize pricing strategy for better profit margins",
          "Expand product offerings in high-demand categories", 
          "Implement customer retention programs",
          "Automate order processing to reduce costs"
        ],
        warnings: monthsOfRunway < 6 ? [
          "Cash flow runway below 6 months - monitor expenses closely",
          "Consider diversifying revenue streams"
        ] : [
          "Monitor seasonal sales fluctuations"
        ],
        opportunities: [
          "WhatsApp marketing showing 25% higher engagement",
          "Bulk order discounts could increase average order value",
          "Premium subscription features available"
        ]
      };

      const predictions = {
        nextMonthRevenue: totalRevenue * (1 + (revenueGrowth / 100)),
        quarterProjection: totalRevenue * 3 * (1 + (revenueGrowth / 100)),
        riskFactors: [
          "Seasonal demand fluctuations",
          "Supply chain cost increases"
        ],
        growthOpportunities: [
          "Market expansion to new customer segments",
          "Product line diversification",
          "Enhanced digital marketing campaigns"
        ]
      };

      const healthData = {
        healthScore,
        scoreBreakdown: {
          revenue: Math.round(revenueScore),
          profitability: Math.round(profitabilityScore),
          cashFlow: Math.round(cashFlowScore),
          growth: Math.round(growthScore),
          efficiency: Math.round(efficiencyScore)
        },
        insights,
        metrics: {
          revenueGrowth: Math.round(revenueGrowth * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          customerAcquisitionCost: Math.round(customerAcquisitionCost),
          customerLifetimeValue: Math.round(customerLifetimeValue),
          burnRate: Math.round(monthlyBurnRate),
          monthsOfRunway: Math.round(monthsOfRunway)
        },
        predictions
      };

      res.json(healthData);
    } catch (error) {
      console.error("Error generating financial health analysis:", error);
      res.status(500).json({ message: "Failed to generate financial health analysis" });
    }
  });

  // POST /api/financial-health/insights
  app.post('/api/financial-health/insights', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { analysis_type, period } = req.body;
      
      // Get financial data for AI analysis
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrders(userId),
        storage.getProducts(userId)
      ]);

      // Use OpenAI to generate advanced insights
      if (!openai) {
        throw new Error("OpenAI not configured");
      }

      const prompt = `As a financial advisor, analyze this wholesale business data:

Revenue: $${stats.totalRevenue}
Orders: ${stats.ordersCount}
Active Products: ${stats.activeProducts}
Low Stock Items: ${stats.lowStockCount}
Recent Orders: ${orders.length}

Provide specific, actionable insights for:
1. Revenue optimization opportunities
2. Cost reduction strategies  
3. Growth potential areas
4. Risk factors to monitor
5. Recommended next steps

Focus on practical B2B wholesale strategies. Be concise and specific.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert financial advisor specializing in B2B wholesale businesses. Provide actionable insights based on the business data."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const aiInsights = JSON.parse(response.choices[0].message.content || '{}');
      
      res.json({
        success: true,
        insights: aiInsights,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error generating AI insights:", error);
      res.status(500).json({ message: "Failed to generate AI insights" });
    }
  });

  // PATCH /api/stock-alerts/:alertId/read
  app.patch('/api/stock-alerts/:alertId/read', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      await storage.markStockAlertAsRead(parseInt(alertId), userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking alert as read:", error);
      res.status(500).json({ message: "Failed to mark alert as read" });
    }
  });

  // PATCH /api/stock-alerts/:alertId/resolve
  app.patch('/api/stock-alerts/:alertId/resolve', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      await storage.resolveStockAlert(parseInt(alertId), userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ message: "Failed to resolve alert" });
    }
  });

  // GET /api/analytics/customers
  app.get('/api/analytics/customers', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      
      const [orders, customers] = await Promise.all([
        storage.getOrders(targetUserId),
        storage.getAllCustomers(targetUserId)
      ]);

      const validOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'].includes(order.status)
      );

      // Customer segmentation — iterate ALL orders so the count matches the customer portal,
      // but only accumulate spend from paid/completed orders.
      // paidOrderCount is tracked separately so avgOrderValue uses a spend-meaningful denominator.
      const customerOrderMap = new Map();
      for (const order of orders) {
        const customerId = order.retailerId;
        const current = customerOrderMap.get(customerId) || {
          orderCount: 0,
          paidOrderCount: 0,
          totalSpent: 0,
          lastOrderDate: null,
          firstOrderDate: null,
          customerName: ''
        };
        if (!current.customerName && order.customerName) {
          current.customerName = order.customerName;
        }

        current.orderCount++;

        // Only add to spend for paid/completed orders
        if (['paid', 'processing', 'shipped', 'delivered', 'fulfilled', 'completed'].includes(order.status)) {
          const orderSubtotal = parseFloat(order.subtotal || order.total || '0');
          const orderPlatformFee = parseFloat(order.platformFee || '0');
          current.totalSpent += (orderSubtotal - orderPlatformFee);
          current.paidOrderCount++;
        }
        
        const orderDate = new Date(order.createdAt);
        if (!current.firstOrderDate || orderDate < current.firstOrderDate) {
          current.firstOrderDate = orderDate;
        }
        if (!current.lastOrderDate || orderDate > current.lastOrderDate) {
          current.lastOrderDate = orderDate;
        }

        customerOrderMap.set(customerId, current);
      }

      // Classify customers
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      let newCustomers = 0;
      let returningCustomers = 0;
      let atRiskCustomers = 0;
      
      for (const [customerId, data] of customerOrderMap) {
        if (data.firstOrderDate && data.firstOrderDate >= thirtyDaysAgo) {
          newCustomers++;
        } else if (data.lastOrderDate && data.lastOrderDate >= thirtyDaysAgo) {
          returningCustomers++;
        } else {
          atRiskCustomers++;
        }
      }

      // Top customers by value
      const topCustomers = Array.from(customerOrderMap.entries())
        .map(([customerId, data]) => {
          const customer = customers.find(c => c.id === customerId);
          return {
            id: customerId,
            name: customer?.name || data.customerName || 'Unknown Customer',
            phone: customer?.phone || '',
            orderCount: data.orderCount,
            totalSpent: Math.round(data.totalSpent * 100) / 100,
            lastOrderDate: data.lastOrderDate?.toISOString().split('T')[0] || '',
            avgOrderValue: Math.round((data.totalSpent / (data.paidOrderCount || 1)) * 100) / 100
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      const insights = {
        segmentation: {
          newCustomers,
          returningCustomers,
          atRiskCustomers,
          totalActiveCustomers: customerOrderMap.size
        },
        topCustomers,
        metrics: {
          averageOrderValue: validOrders.length > 0 ? 
            Math.round((validOrders.reduce((sum, order) => sum + (parseFloat(order.subtotal || order.total || '0') - parseFloat(order.platformFee || '0')), 0) / validOrders.length) * 100) / 100 : 0,
          repeatCustomerRate: customers.length > 0 ? 
            Math.round((returningCustomers / customers.length) * 100) : 0
        }
      };

      res.json(insights);
    } catch (error) {
      console.error("Error fetching customer insights:", error);
      res.status(500).json({ message: "Failed to fetch customer insights" });
    }
  });

  // GET /api/analytics/inventory
  app.get('/api/analytics/inventory', requireAuth, async (req: any, res) => {
    try {
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      
      const [products, orders] = await Promise.all([
        storage.getProducts(targetUserId),
        storage.getOrders(targetUserId)
      ]);

      const validOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'].includes(order.status)
      );

      // Product performance analysis — single batch query instead of N+1 loop
      const productSales = new Map();
      if (validOrders.length > 0) {
        const validOrderIds = validOrders.map(o => o.id);
        const allOrderItems = await db
          .select({
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, validOrderIds));

        for (const item of allOrderItems) {
          const current = productSales.get(item.productId) || { quantity: 0, revenue: 0 };
          current.quantity += item.quantity;
          current.revenue += parseFloat(item.unitPrice || '0') * item.quantity;
          productSales.set(item.productId, current);
        }
      }

      // Categorize products
      const categories = new Map();
      for (const product of products) {
        const category = product.category || 'Uncategorized';
        const current = categories.get(category) || {
          productCount: 0,
          totalStock: 0,
          totalValue: 0
        };
        
        current.productCount++;
        current.totalStock += product.stock || 0;
        current.totalValue += (product.stock || 0) * parseFloat(product.price || '0');
        categories.set(category, current);
      }

      // Performance metrics
      const topPerformers = products
        .map(product => {
          const sales = productSales.get(product.id) || { quantity: 0, revenue: 0 };
          return {
            id: product.id,
            name: product.name,
            category: product.category || 'Uncategorized',
            stock: product.stock || 0,
            price: parseFloat(product.price || '0'),
            quantitySold: sales.quantity,
            revenue: Math.round(sales.revenue * 100) / 100,
            stockValue: Math.round((product.stock || 0) * parseFloat(product.price || '0') * 100) / 100
          };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const slowMovers = products
        .map(product => {
          const sales = productSales.get(product.id) || { quantity: 0, revenue: 0 };
          return {
            id: product.id,
            name: product.name,
            category: product.category || 'Uncategorized',
            stock: product.stock || 0,
            price: parseFloat(product.price || '0'),
            quantitySold: sales.quantity,
            daysSinceLastSale: sales.quantity > 0 ? 
              Math.floor((Date.now() - new Date(product.updatedAt || product.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 
              999,
            stockValue: Math.round((product.stock || 0) * parseFloat(product.price || '0') * 100) / 100
          };
        })
        .filter(product => product.quantitySold === 0 || product.daysSinceLastSale > 30)
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 10);

      const categoryData = Array.from(categories.entries()).map(([name, data]) => ({
        name,
        productCount: data.productCount,
        totalStock: data.totalStock,
        totalValue: Math.round(data.totalValue * 100) / 100
      }));

      const insights = {
        overview: {
          totalProducts: products.length,
          totalStockValue: Math.round(products.reduce((sum, product) => 
            sum + (product.stock || 0) * parseFloat(product.price || '0'), 0
          ) * 100) / 100,
          lowStockCount: products.filter(p => (p.stock || 0) <= (p.lowStockThreshold || 10)).length,
          outOfStockCount: products.filter(p => (p.stock || 0) === 0).length
        },
        performance: {
          topPerformers,
          slowMovers,
          categories: categoryData
        }
      };

      res.json(insights);
    } catch (error) {
      console.error("Error fetching inventory insights:", error);
      res.status(500).json({ message: "Failed to fetch inventory insights" });
    }
  });

  // GET /api/stock-alerts
  app.get('/api/stock-alerts', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const unreadOnly = req.query.unreadOnly === 'true';

      await storage.syncStockAlerts(wholesalerId);
      const alerts = await storage.getStockAlerts(wholesalerId, unreadOnly);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching stock alerts:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts" });
    }
  });

}
