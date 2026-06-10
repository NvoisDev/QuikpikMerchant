import { db } from '../db';
import { users } from '@shared/schema';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { sendTrialReminderEmail } from '../sendgrid-service';

/**
 * Finds wholesalers whose free trial ends in exactly N days and
 * has not yet had the corresponding reminder email sent.
 *
 * "Exactly N days" means the trial end date falls within the calendar
 * day that is N days from today (00:00 → 23:59 UTC).
 */
async function getTrialUsersForReminder(daysAhead: number, reminderField: 'trial14DayReminderSentAt' | 'trial3DayReminderSentAt') {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + daysAhead);

  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);

  return db
    .select({
      id: users.id,
      email: users.email,
      businessName: users.businessName,
      firstName: users.firstName,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
    })
    .from(users)
    .where(
      and(
        eq(users.role, 'wholesaler'),
        eq(users.subscriptionTier, 'free'),
        isNotNull(users.subscriptionPeriodEnd),
        sql`${users.subscriptionPeriodEnd} >= ${start.toISOString()}`,
        sql`${users.subscriptionPeriodEnd} <= ${end.toISOString()}`,
        isNull(users[reminderField]),
        eq(users.isTestAccount, false),
      )
    );
}

export async function checkAndSendTrialReminders(): Promise<number> {
  let sent = 0;

  try {
    const [users14, users3] = await Promise.all([
      getTrialUsersForReminder(14, 'trial14DayReminderSentAt'),
      getTrialUsersForReminder(3, 'trial3DayReminderSentAt'),
    ]);

    for (const user of users14) {
      if (!user.email || !user.subscriptionPeriodEnd) continue;
      const name = user.businessName || user.firstName || 'there';
      const ok = await sendTrialReminderEmail({
        wholesalerEmail: user.email,
        wholesalerName: name,
        daysRemaining: 14,
        trialEndDate: user.subscriptionPeriodEnd,
      });
      if (ok) {
        await db
          .update(users)
          .set({ trial14DayReminderSentAt: new Date() })
          .where(sql`${users.id} = ${user.id}`);
        sent++;
        console.log(`📧 Trial 14-day reminder sent to ${user.email}`);
      }
    }

    for (const user of users3) {
      if (!user.email || !user.subscriptionPeriodEnd) continue;
      const name = user.businessName || user.firstName || 'there';
      const ok = await sendTrialReminderEmail({
        wholesalerEmail: user.email,
        wholesalerName: name,
        daysRemaining: 3,
        trialEndDate: user.subscriptionPeriodEnd,
      });
      if (ok) {
        await db
          .update(users)
          .set({ trial3DayReminderSentAt: new Date() })
          .where(sql`${users.id} = ${user.id}`);
        sent++;
        console.log(`📧 Trial 3-day reminder sent to ${user.email}`);
      }
    }

    return sent;
  } catch (error) {
    console.error('❌ Trial reminder check failed:', error);
    return sent;
  }
}
