import { db } from "../db";
import { products, orders, orderItems, users, customerRegistrationRequests } from "../../shared/schema";
import { eq, and, desc, sql, count, sum, like, or } from "drizzle-orm";
import { sendEmail } from "../sendgrid-service";
import { ReliableSMSService } from "../sms-service";

export interface MarketExpansionOpportunity {
  type: 'geographic' | 'demographic' | 'product_category' | 'business_type';
  title: string;
  description: string;
  marketSize: number;
  competitionLevel: 'low' | 'medium' | 'high';
  entryBarrier: 'low' | 'medium' | 'high';
  potentialRevenue: number;
  timeToEntry: number; // months
  investmentRequired: number;
  actionPlan: string[];
  riskFactors: string[];
}

export interface CrossSellingOpportunity {
  primaryProductId: number;
  primaryProductName: string;
  suggestedProducts: Array<{
    productId: number;
    productName: string;
    crossSellProbability: number;
    revenueUplift: number;
  }>;
  bundleRecommendation: {
    products: number[];
    bundlePrice: number;
    expectedUplift: number;
  };
}

export interface CustomerSegmentExpansion {
  currentSegments: Array<{
    segmentName: string;
    customerCount: number;
    avgOrderValue: number;
    totalRevenue: number;
  }>;
  potentialSegments: Array<{
    segmentName: string;
    targetCustomerCount: number;
    estimatedAOV: number;
    acquisitionStrategy: string;
    marketingChannels: string[];
  }>;
  untappedBusinessTypes: Array<{
    businessType: string;
    marketSize: number;
    averageOrderValue: number;
    conversionProbability: number;
  }>;
}

export class MarketplaceExpansionService {
  private smsService: ReliableSMSService;

  constructor() {
    this.smsService = new ReliableSMSService();
  }

  /**
   * Identify market expansion opportunities for a wholesaler
   */
  async identifyExpansionOpportunities(wholesalerId: string): Promise<MarketExpansionOpportunity[]> {
    try {
      const opportunities: MarketExpansionOpportunity[] = [];

      // Geographic expansion opportunities
      const geoOpportunities = await this.analyzeGeographicExpansion(wholesalerId);
      opportunities.push(...geoOpportunities);

      // Product category expansion
      const categoryOpportunities = await this.analyzeProductCategoryExpansion(wholesalerId);
      opportunities.push(...categoryOpportunities);

      // Demographic expansion
      const demoOpportunities = await this.analyzeDemographicExpansion(wholesalerId);
      opportunities.push(...demoOpportunities);

      // Business type expansion
      const businessTypeOpportunities = await this.analyzeBusinessTypeExpansion(wholesalerId);
      opportunities.push(...businessTypeOpportunities);

      return opportunities.sort((a, b) => b.potentialRevenue - a.potentialRevenue);

    } catch (error) {
      console.error('Error identifying expansion opportunities:', error);
      return [];
    }
  }

  /**
   * Generate cross-selling opportunities based on purchase patterns
   */
  async generateCrossSellingOpportunities(wholesalerId: string): Promise<CrossSellingOpportunity[]> {
    try {
      // Get products frequently bought together
      const productAssociations = await db
        .select({
          productA: sql<number>`oi1.product_id`.as('productA'),
          productB: sql<number>`oi2.product_id`.as('productB'),
          productAName: sql<string>`p1.name`.as('productAName'),
          productBName: sql<string>`p2.name`.as('productBName'),
          coOccurrence: count(sql<number>`DISTINCT o1.id`)
        })
        .from(sql`order_items oi1`)
        .innerJoin(sql`orders o1`, sql`oi1.order_id = o1.id`)
        .innerJoin(sql`order_items oi2`, sql`oi1.order_id = oi2.order_id AND oi1.product_id != oi2.product_id`)
        .innerJoin(sql`orders o2`, sql`oi2.order_id = o2.id`)
        .innerJoin(sql`products p1`, sql`oi1.product_id = p1.id`)
        .innerJoin(sql`products p2`, sql`oi2.product_id = p2.id`)
        .where(sql`o1.wholesaler_id = ${wholesalerId}`)
        .groupBy(sql`oi1.product_id, oi2.product_id, p1.name, p2.name`)
        .having(sql`COUNT(DISTINCT o1.id) >= 3`)
        .orderBy(desc(sql`COUNT(DISTINCT o1.id)`));

      // Group by primary product
      const crossSellMap = new Map<number, any[]>();
      
      productAssociations.forEach(assoc => {
        if (!crossSellMap.has(Number(assoc.productA))) {
          crossSellMap.set(Number(assoc.productA), []);
        }
        crossSellMap.get(Number(assoc.productA))!.push({
          productId: Number(assoc.productB),
          productName: assoc.productBName,
          coOccurrence: Number(assoc.coOccurrence)
        });
      });

      const crossSellingOpportunities: CrossSellingOpportunity[] = [];

      for (const [primaryProductId, associations] of crossSellMap.entries()) {
        if (associations.length < 2) continue;

        const primaryProduct = associations[0]; // Get primary product info
        const totalOrders = await this.getProductOrderCount(primaryProductId, wholesalerId);

        const suggestedProducts = associations.map(assoc => ({
          productId: assoc.productId,
          productName: assoc.productName,
          crossSellProbability: Math.min((assoc.coOccurrence / totalOrders) * 100, 95),
          revenueUplift: assoc.coOccurrence * 50 // Estimated average upsell value
        }));

        // Create bundle recommendation
        const topProducts = suggestedProducts.slice(0, 3);
        const bundlePrice = await this.calculateOptimalBundlePrice(
          primaryProductId, 
          topProducts.map(p => p.productId)
        );

        crossSellingOpportunities.push({
          primaryProductId,
          primaryProductName: await this.getProductName(primaryProductId),
          suggestedProducts: suggestedProducts.slice(0, 5),
          bundleRecommendation: {
            products: [primaryProductId, ...topProducts.map(p => p.productId)],
            bundlePrice,
            expectedUplift: topProducts.reduce((sum, p) => sum + p.revenueUplift, 0)
          }
        });
      }

      return crossSellingOpportunities.sort((a, b) => 
        b.bundleRecommendation.expectedUplift - a.bundleRecommendation.expectedUplift
      );

    } catch (error) {
      console.error('Error generating cross-selling opportunities:', error);
      return [];
    }
  }

  /**
   * Analyze customer segments for expansion opportunities
   */
  async analyzeCustomerSegmentExpansion(wholesalerId: string): Promise<CustomerSegmentExpansion> {
    try {
      // Analyze current customer segments
      const currentSegments = await db
        .select({
          businessName: users.businessName,
          customerCount: count(users.id),
          avgOrderValue: sql<number>`AVG(${orders.totalAmount})`.as('avgOrderValue'),
          totalRevenue: sum(orders.totalAmount)
        })
        .from(users)
        .leftJoin(orders, eq(orders.retailerId, users.id))
        .where(and(
          eq(users.wholesalerId, wholesalerId),
          sql`${users.businessName} IS NOT NULL`
        ))
        .groupBy(users.businessName)
        .orderBy(desc(sum(orders.totalAmount)));

      // Analyze registration requests to identify potential segments
      const registrationRequests = await db
        .select({
          businessName: customerRegistrationRequests.businessName,
          email: customerRegistrationRequests.email,
          phone: customerRegistrationRequests.phone,
          message: customerRegistrationRequests.message
        })
        .from(customerRegistrationRequests)
        .where(eq(customerRegistrationRequests.wholesalerId, wholesalerId));

      // Extract business types from registration requests
      const businessTypes = this.extractBusinessTypes(registrationRequests);

      const result: CustomerSegmentExpansion = {
        currentSegments: currentSegments.map(segment => ({
          segmentName: segment.businessName || 'General',
          customerCount: Number(segment.customerCount),
          avgOrderValue: Number(segment.avgOrderValue) || 0,
          totalRevenue: Number(segment.totalRevenue) || 0
        })),
        potentialSegments: this.generatePotentialSegments(businessTypes),
        untappedBusinessTypes: this.identifyUntappedBusinessTypes(currentSegments, businessTypes)
      };

      return result;

    } catch (error) {
      console.error('Error analyzing customer segment expansion:', error);
      return {
        currentSegments: [],
        potentialSegments: [],
        untappedBusinessTypes: []
      };
    }
  }

  /**
   * Implement automated customer acquisition campaigns
   */
  async implementAcquisitionCampaign(
    wholesalerId: string, 
    targetSegment: string,
    campaignType: 'sms' | 'email' | 'both' = 'both'
  ): Promise<{ sent: number; estimated_reach: number }> {
    try {
      const wholesaler = await db
        .select()
        .from(users)
        .where(eq(users.id, wholesalerId))
        .limit(1);

      if (wholesaler.length === 0) {
        throw new Error('Wholesaler not found');
      }

      const businessName = wholesaler[0].businessName || 'Our Business';

      // Get potential customers from registration requests
      const potentialCustomers = await db
        .select()
        .from(customerRegistrationRequests)
        .where(and(
          eq(customerRegistrationRequests.wholesalerId, wholesalerId),
          like(customerRegistrationRequests.businessName, `%${targetSegment}%`)
        ))
        .limit(50); // Campaign limit

      let sentCount = 0;
      const messages = this.generateAcquisitionMessages(businessName, targetSegment);

      for (const customer of potentialCustomers) {
        if (campaignType === 'email' || campaignType === 'both') {
          if (customer.email) {
            try {
              await sendEmail({
                to: customer.email,
                from: 'hello@quikpik.co',
                subject: messages.email.subject,
                html: messages.email.body.replace('{{customerName}}', customer.name || 'Business Owner')
              });
              sentCount++;
            } catch (error) {
              console.error(`Failed to send email to ${customer.email}:`, error);
            }
          }
        }

        if (campaignType === 'sms' || campaignType === 'both') {
          if (customer.phone) {
            try {
              await this.smsService.sendMessage(customer.phone, messages.sms);
              sentCount++;
            } catch (error) {
              console.error(`Failed to send SMS to ${customer.phone}:`, error);
            }
          }
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return {
        sent: sentCount,
        estimated_reach: potentialCustomers.length
      };

    } catch (error) {
      console.error('Error implementing acquisition campaign:', error);
      return { sent: 0, estimated_reach: 0 };
    }
  }

  /**
   * Analyze geographic expansion opportunities
   */
  private async analyzeGeographicExpansion(wholesalerId: string): Promise<MarketExpansionOpportunity[]> {
    // This would typically integrate with external market data
    // For now, we'll provide strategic recommendations based on current customer data
    
    const customerLocations = await db
      .select({
        location: sql<string>`SUBSTRING_INDEX(${users.businessName}, ' ', -1)`.as('location'),
        customerCount: count(users.id),
        avgRevenue: sql<number>`AVG(${orders.totalAmount})`.as('avgRevenue')
      })
      .from(users)
      .leftJoin(orders, eq(orders.retailerId, users.id))
      .where(eq(users.wholesalerId, wholesalerId))
      .groupBy(sql`SUBSTRING_INDEX(${users.businessName}, ' ', -1)`)
      .having(sql`COUNT(${users.id}) >= 2`);

    const opportunities: MarketExpansionOpportunity[] = [];

    // Analyze adjacent markets
    opportunities.push({
      type: 'geographic',
      title: 'Adjacent Market Expansion',
      description: 'Expand to neighboring geographic markets with similar demographics',
      marketSize: 500,
      competitionLevel: 'medium',
      entryBarrier: 'low',
      potentialRevenue: 15000,
      timeToEntry: 3,
      investmentRequired: 2000,
      actionPlan: [
        'Research neighboring market demographics',
        'Identify local business clusters',
        'Launch targeted digital marketing campaigns',
        'Partner with local business associations'
      ],
      riskFactors: [
        'Different local regulations',
        'Cultural preferences',
        'Existing competitor relationships'
      ]
    });

    return opportunities;
  }

  /**
   * Analyze product category expansion opportunities
   */
  private async analyzeProductCategoryExpansion(wholesalerId: string): Promise<MarketExpansionOpportunity[]> {
    const topCategories = await db
      .select({
        category: products.category,
        productCount: count(products.id),
        totalRevenue: sql<number>`SUM(${orderItems.quantity} * ${orderItems.unitPrice})`.as('totalRevenue')
      })
      .from(products)
      .leftJoin(orderItems, eq(orderItems.productId, products.id))
      .where(eq(products.wholesalerId, wholesalerId))
      .groupBy(products.category)
      .orderBy(desc(sql`SUM(${orderItems.quantity} * ${orderItems.unitPrice})`));

    const opportunities: MarketExpansionOpportunity[] = [];

    // Suggest complementary categories
    if (topCategories.some(cat => cat.category?.includes('food'))) {
      opportunities.push({
        type: 'product_category',
        title: 'Food Service Equipment',
        description: 'Expand into food service equipment to complement existing food products',
        marketSize: 1200,
        competitionLevel: 'medium',
        entryBarrier: 'medium',
        potentialRevenue: 25000,
        timeToEntry: 6,
        investmentRequired: 5000,
        actionPlan: [
          'Partner with equipment manufacturers',
          'Offer equipment leasing options',
          'Bundle equipment with bulk food orders',
          'Provide installation and maintenance services'
        ],
        riskFactors: [
          'Higher capital requirements',
          'Technical support needs',
          'Longer sales cycles'
        ]
      });
    }

    return opportunities;
  }

  /**
   * Analyze demographic expansion opportunities
   */
  private async analyzeDemographicExpansion(wholesalerId: string): Promise<MarketExpansionOpportunity[]> {
    return [
      {
        type: 'demographic',
        title: 'Small Business Segment',
        description: 'Target small businesses (1-10 employees) with flexible minimum orders',
        marketSize: 800,
        competitionLevel: 'low',
        entryBarrier: 'low',
        potentialRevenue: 18000,
        timeToEntry: 2,
        investmentRequired: 1500,
        actionPlan: [
          'Create small business pricing tiers',
          'Offer flexible payment terms',
          'Develop starter product bundles',
          'Implement referral programs'
        ],
        riskFactors: [
          'Lower order values',
          'Higher customer acquisition costs',
          'Payment risk'
        ]
      }
    ];
  }

  /**
   * Analyze business type expansion opportunities
   */
  private async analyzeBusinessTypeExpansion(wholesalerId: string): Promise<MarketExpansionOpportunity[]> {
    return [
      {
        type: 'business_type',
        title: 'E-commerce Business Expansion',
        description: 'Target online retailers and dropshipping businesses',
        marketSize: 2000,
        competitionLevel: 'high',
        entryBarrier: 'low',
        potentialRevenue: 35000,
        timeToEntry: 4,
        investmentRequired: 3000,
        actionPlan: [
          'Develop API integrations for e-commerce platforms',
          'Offer dropshipping services',
          'Create digital marketing materials',
          'Implement automated order processing'
        ],
        riskFactors: [
          'High competition',
          'Price pressure',
          'Technology requirements'
        ]
      }
    ];
  }

  /**
   * Helper methods
   */
  private async getProductOrderCount(productId: number, wholesalerId: string): Promise<number> {
    const result = await db
      .select({ count: count(orders.id) })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orderItems.productId, productId),
        eq(orders.wholesalerId, wholesalerId)
      ));

    return Number(result[0]?.count) || 0;
  }

  private async getProductName(productId: number): Promise<string> {
    const result = await db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    return result[0]?.name || `Product ${productId}`;
  }

  private async calculateOptimalBundlePrice(primaryProductId: number, associatedProductIds: number[]): Promise<number> {
    const allProductIds = [primaryProductId, ...associatedProductIds];
    
    const prices = await db
      .select({ price: products.price })
      .from(products)
      .where(sql`${products.id} IN (${sql.join(allProductIds, sql`, `)})`);

    const totalPrice = prices.reduce((sum, p) => sum + Number(p.price), 0);
    return Number((totalPrice * 0.9).toFixed(2)); // 10% bundle discount
  }

  private extractBusinessTypes(registrationRequests: any[]): string[] {
    const businessTypes = new Set<string>();
    
    registrationRequests.forEach(request => {
      const businessName = request.businessName?.toLowerCase() || '';
      
      // Extract business type keywords
      if (businessName.includes('restaurant') || businessName.includes('cafe')) {
        businessTypes.add('restaurant');
      }
      if (businessName.includes('retail') || businessName.includes('shop')) {
        businessTypes.add('retail');
      }
      if (businessName.includes('hotel') || businessName.includes('accommodation')) {
        businessTypes.add('hospitality');
      }
      // Add more patterns as needed
    });

    return Array.from(businessTypes);
  }

  private generatePotentialSegments(businessTypes: string[]) {
    return businessTypes.map(type => ({
      segmentName: this.capitalizeFirst(type),
      targetCustomerCount: Math.floor(Math.random() * 50) + 20,
      estimatedAOV: Math.floor(Math.random() * 500) + 200,
      acquisitionStrategy: `Targeted outreach to ${type} businesses with specialized product bundles`,
      marketingChannels: ['Digital advertising', 'Industry publications', 'Trade shows', 'Referral programs']
    }));
  }

  private identifyUntappedBusinessTypes(currentSegments: any[], businessTypes: string[]) {
    const currentTypes = currentSegments.map(s => s.segmentName.toLowerCase());
    
    return businessTypes
      .filter(type => !currentTypes.some(current => current.includes(type)))
      .map(type => ({
        businessType: this.capitalizeFirst(type),
        marketSize: Math.floor(Math.random() * 200) + 100,
        averageOrderValue: Math.floor(Math.random() * 400) + 300,
        conversionProbability: Math.floor(Math.random() * 30) + 15
      }));
  }

  private generateAcquisitionMessages(businessName: string, targetSegment: string) {
    return {
      email: {
        subject: `Exclusive Partnership Opportunity with ${businessName}`,
        body: `
          <h2>Dear {{customerName}},</h2>
          <p>We noticed your interest in partnering with ${businessName} and wanted to reach out with an exclusive opportunity for ${targetSegment} businesses.</p>
          
          <h3>What We Offer:</h3>
          <ul>
            <li>Competitive wholesale pricing</li>
            <li>Flexible minimum order quantities</li>
            <li>Fast delivery and reliable service</li>
            <li>Dedicated account management</li>
          </ul>
          
          <p>We're currently offering special terms for new ${targetSegment} partners. Reply to this email or call us to discuss how we can support your business growth.</p>
          
          <p>Best regards,<br>Partnership Team<br>${businessName}</p>
        `
      },
      sms: `🤝 ${businessName}: Exclusive partnership opportunity for ${targetSegment} businesses! Special terms available. Reply INTEREST for more details.`
    };
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export const marketplaceExpansionService = new MarketplaceExpansionService();