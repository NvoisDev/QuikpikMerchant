import { db } from "../db";
import { products, orders, orderItems, users } from "../../shared/schema";
import { eq, and, gte, desc, sql, count, avg } from "drizzle-orm";

export interface PricingRecommendation {
  productId: number;
  productName: string;
  currentPrice: number;
  recommendedPrice: number;
  priceChange: number;
  priceChangePercent: number;
  reasoning: string;
  confidence: number; // 0-100
  expectedImpact: {
    revenueChange: number;
    demandChange: number;
  };
  marketPosition: 'premium' | 'competitive' | 'value';
}

export interface DynamicPricingStrategy {
  wholesalerId: string;
  strategy: 'profit_optimization' | 'market_penetration' | 'inventory_clearance' | 'demand_based';
  recommendations: PricingRecommendation[];
  totalPotentialRevenue: number;
  implementationPriority: Array<{
    productId: number;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }>;
}

export interface SeasonalPricingPattern {
  productId: number;
  seasonalMultipliers: {
    spring: number;
    summer: number;
    autumn: number;
    winter: number;
  };
  peakMonths: string[];
  lowMonths: string[];
  volatility: number;
}

export class DynamicPricingService {
  /**
   * Generate comprehensive pricing recommendations for a wholesaler
   */
  async generatePricingStrategy(
    wholesalerId: string, 
    strategy: 'profit_optimization' | 'market_penetration' | 'inventory_clearance' | 'demand_based' = 'profit_optimization'
  ): Promise<DynamicPricingStrategy> {
    try {
      // Get all products with their performance data
      const productPerformance = await this.getProductPerformanceData(wholesalerId);
      
      // Generate recommendations based on strategy
      const recommendations = await this.generateRecommendations(productPerformance, strategy);
      
      // Calculate implementation priorities
      const implementationPriority = this.calculateImplementationPriority(recommendations);
      
      // Calculate total potential revenue impact
      const totalPotentialRevenue = recommendations.reduce((total, rec) => 
        total + rec.expectedImpact.revenueChange, 0
      );

      return {
        wholesalerId,
        strategy,
        recommendations,
        totalPotentialRevenue,
        implementationPriority
      };

    } catch (error) {
      console.error('Error generating pricing strategy:', error);
      return {
        wholesalerId,
        strategy,
        recommendations: [],
        totalPotentialRevenue: 0,
        implementationPriority: []
      };
    }
  }

  /**
   * Analyze seasonal pricing patterns for products
   */
  async analyzeSeasonalPricing(wholesalerId: string): Promise<SeasonalPricingPattern[]> {
    try {
      const patterns = await db
        .select({
          productId: orderItems.productId,
          productName: products.name,
          month: sql<number>`MONTH(${orders.createdAt})`.as('month'),
          avgPrice: avg(orderItems.unitPrice),
          totalQuantity: sql<number>`SUM(${orderItems.quantity})`.as('totalQuantity')
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orders.wholesalerId, wholesalerId))
        .groupBy(orderItems.productId, products.name, sql`MONTH(${orders.createdAt})`)
        .orderBy(orderItems.productId, sql`MONTH(${orders.createdAt})`);

      // Group by product and calculate seasonal patterns
      const productPatterns = new Map<number, any[]>();
      
      patterns.forEach(pattern => {
        if (!productPatterns.has(pattern.productId)) {
          productPatterns.set(pattern.productId, []);
        }
        productPatterns.get(pattern.productId)!.push(pattern);
      });

      return Array.from(productPatterns.entries()).map(([productId, monthlyData]) => {
        const seasonalData = this.calculateSeasonalMultipliers(monthlyData);
        
        return {
          productId,
          seasonalMultipliers: seasonalData.multipliers,
          peakMonths: seasonalData.peakMonths,
          lowMonths: seasonalData.lowMonths,
          volatility: seasonalData.volatility
        };
      });

    } catch (error) {
      console.error('Error analyzing seasonal pricing:', error);
      return [];
    }
  }

  /**
   * Implement automated price adjustments based on demand
   */
  async implementDemandBasedPricing(wholesalerId: string): Promise<{ updated: number; revenue_impact: number }> {
    try {
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      // Get products with recent demand data
      const demandData = await db
        .select({
          productId: products.id,
          currentPrice: products.price,
          recentSales: count(orderItems.id),
          avgDailyDemand: sql<number>`COUNT(${orderItems.id}) / 30`.as('avgDailyDemand'),
          stock: products.stock
        })
        .from(products)
        .leftJoin(orderItems, eq(orderItems.productId, products.id))
        .leftJoin(orders, and(
          eq(orderItems.orderId, orders.id),
          gte(orders.createdAt, last30Days)
        ))
        .where(eq(products.wholesalerId, wholesalerId))
        .groupBy(products.id, products.price, products.stock);

      let updatedCount = 0;
      let totalRevenueImpact = 0;

      for (const product of demandData) {
        const demandScore = this.calculateDemandScore(
          Number(product.recentSales),
          Number(product.avgDailyDemand),
          product.stock || 0
        );

        let newPrice = Number(product.currentPrice);
        let priceAdjustment = 0;

        // High demand + low stock = increase price
        if (demandScore > 80 && product.stock && product.stock < 50) {
          priceAdjustment = 0.05; // 5% increase
        }
        // Low demand + high stock = decrease price
        else if (demandScore < 30 && product.stock && product.stock > 100) {
          priceAdjustment = -0.10; // 10% decrease
        }
        // Moderate demand = small adjustments
        else if (demandScore > 60) {
          priceAdjustment = 0.02; // 2% increase
        }

        if (priceAdjustment !== 0) {
          newPrice = Number(product.currentPrice) * (1 + priceAdjustment);
          
          // Update product price
          await db
            .update(products)
            .set({ price: newPrice.toFixed(2) })
            .where(eq(products.id, product.productId));

          updatedCount++;
          
          // Estimate revenue impact based on recent sales
          const estimatedMonthlySales = Number(product.recentSales);
          totalRevenueImpact += estimatedMonthlySales * (newPrice - Number(product.currentPrice));
        }
      }

      return {
        updated: updatedCount,
        revenue_impact: totalRevenueImpact
      };

    } catch (error) {
      console.error('Error implementing demand-based pricing:', error);
      return { updated: 0, revenue_impact: 0 };
    }
  }

  /**
   * Get comprehensive product performance data
   */
  private async getProductPerformanceData(wholesalerId: string) {
    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);

    return await db
      .select({
        productId: products.id,
        productName: products.name,
        currentPrice: products.price,
        stock: products.stock,
        moq: products.moq,
        totalSales: sql<number>`COALESCE(SUM(${orderItems.quantity} * ${orderItems.unitPrice}), 0)`.as('totalSales'),
        totalQuantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`.as('totalQuantity'),
        orderCount: count(orders.id),
        avgOrderValue: sql<number>`COALESCE(AVG(${orderItems.quantity} * ${orderItems.unitPrice}), 0)`.as('avgOrderValue'),
        lastSaleDate: sql<string>`MAX(${orders.createdAt})`.as('lastSaleDate')
      })
      .from(products)
      .leftJoin(orderItems, eq(orderItems.productId, products.id))
      .leftJoin(orders, and(
        eq(orderItems.orderId, orders.id),
        gte(orders.createdAt, last90Days)
      ))
      .where(eq(products.wholesalerId, wholesalerId))
      .groupBy(products.id, products.name, products.price, products.stock, products.moq);
  }

  /**
   * Generate pricing recommendations based on strategy
   */
  private async generateRecommendations(
    productData: any[], 
    strategy: string
  ): Promise<PricingRecommendation[]> {
    const recommendations: PricingRecommendation[] = [];

    for (const product of productData) {
      const currentPrice = Number(product.currentPrice);
      const totalSales = Number(product.totalSales);
      const totalQuantity = Number(product.totalQuantity);
      const stock = product.stock || 0;

      let recommendedPrice = currentPrice;
      let reasoning = '';
      let confidence = 50;

      switch (strategy) {
        case 'profit_optimization':
          // Increase prices for high-demand, profitable products
          if (totalQuantity > 50 && totalSales > 500) {
            recommendedPrice = currentPrice * 1.08; // 8% increase
            reasoning = 'High demand product with strong sales performance. Price increase likely to improve margins.';
            confidence = 75;
          } else if (totalQuantity < 10 && stock > 100) {
            recommendedPrice = currentPrice * 0.85; // 15% decrease
            reasoning = 'Low demand with excess inventory. Price reduction needed to move stock.';
            confidence = 80;
          }
          break;

        case 'market_penetration':
          // Lower prices to gain market share
          if (totalQuantity < 30) {
            recommendedPrice = currentPrice * 0.90; // 10% decrease
            reasoning = 'Market penetration strategy: reduce price to increase adoption and market share.';
            confidence = 65;
          }
          break;

        case 'inventory_clearance':
          // Aggressive pricing for overstocked items
          if (stock > 200 || (product.lastSaleDate && 
              Math.floor((Date.now() - new Date(product.lastSaleDate).getTime()) / (1000 * 60 * 60 * 24)) > 60)) {
            recommendedPrice = currentPrice * 0.70; // 30% decrease
            reasoning = 'Inventory clearance: high stock levels or slow-moving product requires aggressive pricing.';
            confidence = 90;
          }
          break;

        case 'demand_based':
          // Price based on recent demand patterns
          const demandScore = totalQuantity / Math.max(stock / 10, 1);
          if (demandScore > 5) {
            recommendedPrice = currentPrice * 1.05; // 5% increase
            reasoning = 'High demand relative to stock levels. Market can support higher pricing.';
            confidence = 70;
          } else if (demandScore < 1) {
            recommendedPrice = currentPrice * 0.92; // 8% decrease
            reasoning = 'Low demand relative to stock. Price reduction may stimulate sales.';
            confidence = 75;
          }
          break;
      }

      // Only include products where we recommend a change
      if (Math.abs(recommendedPrice - currentPrice) > 0.01) {
        const priceChange = recommendedPrice - currentPrice;
        const priceChangePercent = (priceChange / currentPrice) * 100;
        
        // Estimate demand elasticity (simplified)
        const elasticity = this.estimateDemandElasticity(totalQuantity, currentPrice);
        const expectedDemandChange = -elasticity * priceChangePercent;
        const expectedRevenueChange = totalSales * (priceChangePercent / 100) * (1 + expectedDemandChange / 100);

        recommendations.push({
          productId: product.productId,
          productName: product.productName,
          currentPrice,
          recommendedPrice: Number(recommendedPrice.toFixed(2)),
          priceChange: Number(priceChange.toFixed(2)),
          priceChangePercent: Number(priceChangePercent.toFixed(1)),
          reasoning,
          confidence,
          expectedImpact: {
            revenueChange: Number(expectedRevenueChange.toFixed(2)),
            demandChange: Number(expectedDemandChange.toFixed(1))
          },
          marketPosition: this.determineMarketPosition(currentPrice, totalSales, totalQuantity)
        });
      }
    }

    return recommendations;
  }

  /**
   * Calculate seasonal multipliers for pricing
   */
  private calculateSeasonalMultipliers(monthlyData: any[]) {
    const seasonMap = {
      spring: [3, 4, 5],
      summer: [6, 7, 8],
      autumn: [9, 10, 11],
      winter: [12, 1, 2]
    };

    const seasonData = {
      spring: { sales: 0, count: 0 },
      summer: { sales: 0, count: 0 },
      autumn: { sales: 0, count: 0 },
      winter: { sales: 0, count: 0 }
    };

    // Aggregate data by season
    monthlyData.forEach(data => {
      const month = Number(data.month);
      const season = Object.entries(seasonMap).find(([, months]) => 
        months.includes(month)
      )?.[0] as keyof typeof seasonData;

      if (season) {
        seasonData[season].sales += Number(data.totalQuantity);
        seasonData[season].count++;
      }
    });

    // Calculate seasonal averages
    const seasonAverages = Object.fromEntries(
      Object.entries(seasonData).map(([season, data]) => [
        season,
        data.count > 0 ? data.sales / data.count : 0
      ])
    );

    const overallAverage = Object.values(seasonAverages).reduce((a, b) => a + b, 0) / 4;

    // Calculate multipliers
    const multipliers = Object.fromEntries(
      Object.entries(seasonAverages).map(([season, avg]) => [
        season,
        overallAverage > 0 ? Number((avg / overallAverage).toFixed(2)) : 1
      ])
    );

    // Find peak and low months
    const sortedSeasons = Object.entries(multipliers).sort(([,a], [,b]) => b - a);
    const peakMonths = sortedSeasons.slice(0, 2).map(([season]) => season);
    const lowMonths = sortedSeasons.slice(-2).map(([season]) => season);

    // Calculate volatility
    const variance = Object.values(multipliers).reduce((acc, mult) => 
      acc + Math.pow(mult - 1, 2), 0) / 4;
    const volatility = Math.sqrt(variance);

    return {
      multipliers,
      peakMonths,
      lowMonths,
      volatility: Number(volatility.toFixed(2))
    };
  }

  /**
   * Calculate demand score (0-100)
   */
  private calculateDemandScore(recentSales: number, avgDailyDemand: number, stock: number): number {
    let score = 0;

    // Sales volume component (0-40)
    score += Math.min(recentSales / 10, 40);

    // Daily demand component (0-30)
    score += Math.min(avgDailyDemand * 10, 30);

    // Stock level component (0-30) - inverse relationship
    const stockScore = stock > 0 ? Math.max(0, 30 - (stock / 10)) : 30;
    score += stockScore;

    return Math.min(Math.round(score), 100);
  }

  /**
   * Estimate demand elasticity for a product
   */
  private estimateDemandElasticity(quantity: number, price: number): number {
    // Simplified elasticity model
    // Higher priced items tend to be more elastic
    const priceElasticity = Math.min(price / 100, 2);
    
    // Lower quantity items might be more elastic (niche products)
    const quantityElasticity = quantity < 50 ? 1.5 : 1;

    return priceElasticity * quantityElasticity;
  }

  /**
   * Determine market position based on performance
   */
  private determineMarketPosition(price: number, sales: number, quantity: number): 'premium' | 'competitive' | 'value' {
    const revenuePerUnit = quantity > 0 ? sales / quantity : price;
    
    if (revenuePerUnit > price * 0.9 && quantity < 100) return 'premium';
    if (revenuePerUnit > price * 0.7) return 'competitive';
    return 'value';
  }

  /**
   * Calculate implementation priority for recommendations
   */
  private calculateImplementationPriority(recommendations: PricingRecommendation[]) {
    return recommendations.map(rec => {
      let priority: 'high' | 'medium' | 'low' = 'low';
      let reason = '';

      if (rec.confidence > 80 && rec.expectedImpact.revenueChange > 100) {
        priority = 'high';
        reason = 'High confidence recommendation with significant revenue impact';
      } else if (rec.confidence > 60 && Math.abs(rec.expectedImpact.revenueChange) > 50) {
        priority = 'medium';
        reason = 'Moderate confidence with meaningful business impact';
      } else {
        reason = 'Low priority - implement after high/medium priority changes';
      }

      return {
        productId: rec.productId,
        priority,
        reason
      };
    }).sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}

export const dynamicPricingService = new DynamicPricingService();