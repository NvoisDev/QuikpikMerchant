import { db } from "./db";
import { subscriptionAuditLogs } from "../shared/schema";
import { eq, gte, desc } from "drizzle-orm";

export interface SubscriptionLogEvent {
  userId: string;
  eventType: 'upgrade' | 'downgrade' | 'cancel' | 'reactivate' | 'payment_success' | 'payment_failed' | 'webhook_received' | 'manual_override' | 'product_unlock' | 'limit_reached';
  fromTier?: string;
  toTier?: string;
  amount?: number;
  currency?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export class SubscriptionLogger {
  static async log(event: SubscriptionLogEvent): Promise<void> {
    try {
      const logEntry = {
        userId: event.userId,
        eventType: event.eventType,
        fromTier: event.fromTier || null,
        toTier: event.toTier || null,
        amount: event.amount || null,
        currency: event.currency || null,
        stripeSubscriptionId: event.stripeSubscriptionId || null,
        stripeCustomerId: event.stripeCustomerId || null,
        reason: event.reason || null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        timestamp: new Date()
      };

      await db.insert(subscriptionAuditLogs).values([logEntry]);
      
      // Console logging with structured format
      const logMessage = `🔔 SUBSCRIPTION EVENT: ${event.eventType.toUpperCase()}`;
      const details = [
        `User: ${event.userId}`,
        event.fromTier && event.toTier ? `${event.fromTier} → ${event.toTier}` : 
        event.toTier ? `Tier: ${event.toTier}` : '',
        event.amount ? `Amount: ${event.currency || 'USD'} ${event.amount}` : '',
        event.stripeSubscriptionId ? `Subscription: ${event.stripeSubscriptionId}` : '',
        event.reason ? `Reason: ${event.reason}` : ''
      ].filter(Boolean).join(' | ');

      console.log(`${logMessage} - ${details}`);
      
      if (event.metadata) {
        console.log(`📋 Metadata:`, event.metadata);
      }
    } catch (error) {
      console.error('❌ Failed to log subscription event:', error);
      // Don't throw error to avoid breaking subscription flow
    }
  }

  static async getUserSubscriptionHistory(userId: string) {
    try {
      const logs = await db
        .select()
        .from(subscriptionAuditLogs)
        .where(eq(subscriptionAuditLogs.userId, userId))
        .orderBy(desc(subscriptionAuditLogs.timestamp));
      
      return logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }));
    } catch (error) {
      console.error('❌ Failed to fetch subscription history:', error);
      return [];
    }
  }

  static async getSubscriptionStats(timeRange: '24h' | '7d' | '30d' | '90d' = '30d') {
    try {
      const cutoffDate = new Date();
      switch (timeRange) {
        case '24h':
          cutoffDate.setHours(cutoffDate.getHours() - 24);
          break;
        case '7d':
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case '30d':
          cutoffDate.setDate(cutoffDate.getDate() - 30);
          break;
        case '90d':
          cutoffDate.setDate(cutoffDate.getDate() - 90);
          break;
      }

      const logs = await db
        .select()
        .from(subscriptionAuditLogs)
        .where(gte(subscriptionAuditLogs.timestamp, cutoffDate));

      const stats = {
        totalEvents: logs.length,
        upgrades: logs.filter(log => log.eventType === 'upgrade').length,
        downgrades: logs.filter(log => log.eventType === 'downgrade').length,
        cancellations: logs.filter(log => log.eventType === 'cancel').length,
        paymentSuccesses: logs.filter(log => log.eventType === 'payment_success').length,
        paymentFailures: logs.filter(log => log.eventType === 'payment_failed').length,
        totalRevenue: logs
          .filter(log => log.eventType === 'payment_success' && log.amount)
          .reduce((sum, log) => sum + parseFloat(log.amount?.toString() || '0'), 0),
        events: logs.map(log => ({
          ...log,
          metadata: log.metadata ? JSON.parse(log.metadata) : null
        }))
      };

      console.log(`📊 Subscription Stats (${timeRange}):`, {
        totalEvents: stats.totalEvents,
        upgrades: stats.upgrades,
        downgrades: stats.downgrades,
        cancellations: stats.cancellations,
        totalRevenue: stats.totalRevenue
      });

      return stats;
    } catch (error) {
      console.error('❌ Failed to fetch subscription stats:', error);
      return null;
    }
  }
}

// Helper functions for common subscription events
export const logSubscriptionUpgrade = (userId: string, fromTier: string, toTier: string, amount?: number, metadata?: Record<string, any>) => {
  return SubscriptionLogger.log({
    userId,
    eventType: 'upgrade',
    fromTier,
    toTier,
    amount,
    currency: 'GBP',
    reason: 'User initiated upgrade',
    metadata
  });
};

export const logSubscriptionDowngrade = (userId: string, fromTier: string, toTier: string, reason?: string, metadata?: Record<string, any>) => {
  return SubscriptionLogger.log({
    userId,
    eventType: 'downgrade',
    fromTier,
    toTier,
    reason: reason || 'User initiated downgrade',
    metadata
  });
};

export const logPaymentSuccess = (userId: string, amount: number, stripeSubscriptionId?: string, metadata?: Record<string, any>) => {
  return SubscriptionLogger.log({
    userId,
    eventType: 'payment_success',
    amount,
    currency: 'GBP',
    stripeSubscriptionId,
    reason: 'Stripe payment processed successfully',
    metadata
  });
};

export const logPaymentFailure = (userId: string, amount: number, reason: string, stripeSubscriptionId?: string, metadata?: Record<string, any>) => {
  return SubscriptionLogger.log({
    userId,
    eventType: 'payment_failed',
    amount,
    currency: 'GBP',
    stripeSubscriptionId,
    reason,
    metadata
  });
};

export const logManualOverride = (userId: string, fromTier: string, toTier: string, reason: string, metadata?: Record<string, any>) => {
  return SubscriptionLogger.log({
    userId,
    eventType: 'manual_override',
    fromTier,
    toTier,
    reason,
    metadata
  });
};

export const logProductUnlock = (userId: string, productCount: number, tier: string, metadata?: Record<string, any>) => {
  return SubscriptionLogger.log({
    userId,
    eventType: 'product_unlock',
    toTier: tier,
    reason: `Unlocked ${productCount} products after subscription upgrade`,
    metadata: { ...metadata, productCount }
  });
};

export const logLimitReached = (userId: string, limitType: string, currentCount: number, tier: string, metadata?: Record<string, any>) => {
  return SubscriptionLogger.log({
    userId,
    eventType: 'limit_reached',
    toTier: tier,
    reason: `${limitType} limit reached: ${currentCount}`,
    metadata: { ...metadata, limitType, currentCount }
  });
};