import { businessProfiles, users, type BusinessProfile, type InsertBusinessProfile } from "@shared/schema";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { DeliveryStorage } from "./delivery";

export interface BankDetails {
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  sortCode?: string | null;
  iban?: string | null;
  swift?: string | null;
}

export interface InvoiceSignOffData {
  invoiceSignOff?: string | null;
}

export class BusinessProfileStorage extends DeliveryStorage {
  async getBusinessProfiles(wholesalerId: string): Promise<BusinessProfile[]> {
    let profiles = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.wholesalerId, wholesalerId))
      .orderBy(businessProfiles.createdAt);

    if (profiles.length === 0) {
      const [wholesaler] = await db.select().from(users).where(eq(users.id, wholesalerId));
      if (wholesaler) {
        const defaultName =
          wholesaler.businessName ||
          `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() ||
          'Default Profile';
        const [seeded] = await db
          .insert(businessProfiles)
          .values({
            wholesalerId,
            name: defaultName,
            logoUrl: wholesaler.logoUrl || null,
            address: wholesaler.businessAddress || null,
            isDefault: true,
          })
          .returning();
        profiles = seeded ? [seeded] : [];
      }
    }

    return profiles;
  }

  async getBusinessProfile(id: number): Promise<BusinessProfile | undefined> {
    const [profile] = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.id, id));
    return profile;
  }

  async createBusinessProfile(data: InsertBusinessProfile): Promise<BusinessProfile> {
    const existing = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.wholesalerId, data.wholesalerId));

    // Strip isDefault from client payload — only the system may decide the default
    const { isDefault: _ignored, ...insertData } = data;
    const shouldBeDefault = existing.length === 0;

    const [profile] = await db
      .insert(businessProfiles)
      .values({ ...insertData, isDefault: shouldBeDefault })
      .returning();
    return profile;
  }

  async updateBusinessProfile(
    id: number,
    data: Partial<InsertBusinessProfile>,
  ): Promise<BusinessProfile | undefined> {
    const { isDefault: _ignored, wholesalerId: _wid, ...safeUpdates } = data;
    const [updated] = await db
      .update(businessProfiles)
      .set({ ...safeUpdates, updatedAt: new Date() })
      .where(eq(businessProfiles.id, id))
      .returning();
    return updated;
  }

  async deleteBusinessProfile(id: number, wholesalerId: string): Promise<boolean> {
    const [profile] = await db
      .select()
      .from(businessProfiles)
      .where(
        and(
          eq(businessProfiles.id, id),
          eq(businessProfiles.wholesalerId, wholesalerId),
        ),
      );

    if (!profile || profile.isDefault) return false;

    await db.delete(businessProfiles).where(eq(businessProfiles.id, id));
    return true;
  }

  async getDefaultBusinessProfile(wholesalerId: string): Promise<BusinessProfile | undefined> {
    const profiles = await this.getBusinessProfiles(wholesalerId);
    return profiles.find(p => p.isDefault) ?? profiles[0];
  }

  async updateBankDetails(wholesalerId: string, data: BankDetails): Promise<BusinessProfile | undefined> {
    const profile = await this.getDefaultBusinessProfile(wholesalerId);
    if (!profile) return undefined;
    const trim = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() || null : null);
    const [updated] = await db
      .update(businessProfiles)
      .set({
        bankName: trim(data.bankName),
        accountName: trim(data.accountName),
        accountNumber: trim(data.accountNumber),
        sortCode: trim(data.sortCode),
        iban: trim(data.iban),
        swift: trim(data.swift),
        updatedAt: new Date(),
      })
      .where(eq(businessProfiles.id, profile.id))
      .returning();
    return updated;
  }

  async updateInvoiceSignOff(wholesalerId: string, data: InvoiceSignOffData): Promise<BusinessProfile | undefined> {
    const profile = await this.getDefaultBusinessProfile(wholesalerId);
    if (!profile) return undefined;
    const trim = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() || null : null);
    const [updated] = await db
      .update(businessProfiles)
      .set({
        invoiceSignOff: trim(data.invoiceSignOff),
        updatedAt: new Date(),
      })
      .where(eq(businessProfiles.id, profile.id))
      .returning();
    return updated;
  }

  async setDefaultBusinessProfile(
    id: number,
    wholesalerId: string,
  ): Promise<BusinessProfile | undefined> {
    // Verify the target profile exists and belongs to this wholesaler BEFORE clearing defaults
    const [target] = await db
      .select()
      .from(businessProfiles)
      .where(and(eq(businessProfiles.id, id), eq(businessProfiles.wholesalerId, wholesalerId)));

    if (!target) return undefined;

    // Now atomically clear existing defaults and set the new one
    await db
      .update(businessProfiles)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(businessProfiles.wholesalerId, wholesalerId));

    const [updated] = await db
      .update(businessProfiles)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(
          eq(businessProfiles.id, id),
          eq(businessProfiles.wholesalerId, wholesalerId),
        ),
      )
      .returning();

    return updated;
  }
}
