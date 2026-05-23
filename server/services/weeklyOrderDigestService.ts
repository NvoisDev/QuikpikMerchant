import { db } from '../db';
import { orders, users } from '@shared/schema';
import { and, lt, notInArray, eq, sql } from 'drizzle-orm';
import { sendWeeklyOrderDigestEmail } from '../sendgrid-service';

const STALE_DAYS = 15;
const UNFULFILLED_STATUSES = ['cancelled', 'fulfilled', 'completed', 'draft'];

interface StaleOrder {
  id: number;
  orderNumber: string | null;
  customerName: string | null;
  createdAt: Date | null;
  status: string | null;
  total: string | null;
}

interface WholesalerDigestData {
  id: string;
  email: string | null;
  businessName: string | null;
  notificationPreferences: Record<string, unknown>;
}

export async function checkAndSendWeeklyOrderDigests(): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS);

    const wholesalers = await db
      .select({
        id: users.id,
        email: users.email,
        businessName: users.businessName,
        notificationPreferences: users.notificationPreferences,
      })
      .from(users)
      .where(sql`${users.role} = 'wholesaler'`);

    let digestsSent = 0;

    for (const wholesaler of wholesalers) {
      try {
        const sent = await processWholesalerDigest(wholesaler as WholesalerDigestData, cutoffDate);
        if (sent) digestsSent++;
      } catch (err) {
        console.error(`❌ Weekly digest failed for wholesaler ${wholesaler.id}:`, err);
      }
    }

    return digestsSent;
  } catch (error) {
    console.error('❌ Error in weekly order digest check:', error);
    return 0;
  }
}

async function processWholesalerDigest(
  wholesaler: WholesalerDigestData,
  cutoffDate: Date
): Promise<boolean> {
  if (!wholesaler.email) return false;

  const prefs = wholesaler.notificationPreferences || {};

  if (prefs.weeklyOrderDigestEnabled === false) return false;

  const lastSentRaw = prefs.lastWeeklyOrderDigestSentAt as string | null | undefined;
  if (lastSentRaw) {
    const lastSent = new Date(lastSentRaw);
    const daysSinceLast = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast < 6.5) return false;
  }

  const staleOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      createdAt: orders.createdAt,
      status: orders.status,
      total: orders.total,
    })
    .from(orders)
    .where(
      and(
        eq(orders.wholesalerId, wholesaler.id),
        lt(orders.createdAt, cutoffDate),
        notInArray(orders.status, UNFULFILLED_STATUSES)
      )
    );

  if (staleOrders.length === 0) return false;

  const sent = await sendWeeklyOrderDigestEmail({
    wholesalerEmail: wholesaler.email,
    businessName: wholesaler.businessName || 'Your Business',
    orders: staleOrders.map((o) => ({
      orderNumber: o.orderNumber || 'N/A',
      customerName: o.customerName || 'Unknown Customer',
      createdAt: o.createdAt!,
      status: o.status || 'pending',
      total: o.total ? parseFloat(o.total) : 0,
    })),
  });

  if (sent) {
    const updatedPrefs = { ...prefs, lastWeeklyOrderDigestSentAt: new Date().toISOString() };
    await db
      .update(users)
      .set({ notificationPreferences: updatedPrefs })
      .where(eq(users.id, wholesaler.id));
  }

  return sent;
}
