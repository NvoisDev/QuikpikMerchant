import { db } from "../db";
import { quoteActivityLogs } from "@shared/schema";
import { and, eq, gte } from "drizzle-orm";

export interface QuoteActivityEntry {
  quoteId: number;
  actionType: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  description: string;
  performedBy?: string;
}

export async function logQuoteActivity(entry: QuoteActivityEntry): Promise<void> {
  try {
    // Dedup guard: skip if an identical entry was logged within the last 60 seconds
    const sixtySecondsAgo = new Date(Date.now() - 60_000);
    const recentEntries = await db
      .select({
        actionType: quoteActivityLogs.actionType,
        entityId: quoteActivityLogs.entityId,
        oldValue: quoteActivityLogs.oldValue,
        newValue: quoteActivityLogs.newValue,
        description: quoteActivityLogs.description,
      })
      .from(quoteActivityLogs)
      .where(
        and(
          eq(quoteActivityLogs.quoteId, entry.quoteId),
          eq(quoteActivityLogs.actionType, entry.actionType),
          gte(quoteActivityLogs.createdAt, sixtySecondsAgo),
        )
      );

    const entryEntityId = entry.entityId ?? null;
    const entryOldJson = JSON.stringify(entry.oldValue ?? null);
    const entryNewJson = JSON.stringify(entry.newValue ?? null);

    for (const existing of recentEntries) {
      if (
        (existing.entityId ?? null) === entryEntityId &&
        JSON.stringify(existing.oldValue ?? null) === entryOldJson &&
        JSON.stringify(existing.newValue ?? null) === entryNewJson &&
        existing.description === entry.description
      ) {
        return;
      }
    }

    await db.insert(quoteActivityLogs).values({
      quoteId: entry.quoteId,
      actionType: entry.actionType,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      description: entry.description,
      performedBy: entry.performedBy ?? 'system',
    });
  } catch (err) {
    console.warn('[quote-activity] Failed to log activity (non-fatal):', err);
  }
}
