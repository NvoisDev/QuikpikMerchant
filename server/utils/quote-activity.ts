import { db } from "../db";
import { quoteActivityLogs } from "@shared/schema";

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
