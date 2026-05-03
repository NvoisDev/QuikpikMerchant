import type { Request } from 'express';

export interface CustomerAuthSession {
  customerId: string;
  wholesalerId: string;
  name: string;
  email: string;
  phone: string;
  groupId: string | null;
  groupName: string;
  authenticatedAt: string;
  expiresAt: string;
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      role: string;
      wholesalerId?: string | null;
      isTestAccount?: boolean | null;
      subscriptionTier?: string | null;
      teamMemberRole?: string | null;
      businessName?: string | null;
      phoneNumber?: string | null;
      claims?: Record<string, unknown>;
      expires_at?: number;
      refresh_token?: string;
      profileImageUrl?: string | null;
      [key: string]: unknown;
    }
    interface Request {
      _adminEmail?: string | null;
      _impersonatingBusinessName?: string | null;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    customerAuth?: CustomerAuthSession;
    returnTo?: string;
    passport?: { user: unknown };
    userId?: string;
    user?: { id: string; email: string | null; [key: string]: unknown };
    impersonationToken?: {
      token: string;
      wholesalerId: string;
      adminEmail: string;
      expiresAt: number;
    };
    verifiedPhone?: string;
    verifiedCode?: string;
    verifiedPhoneExpiry?: number;
  }
}

declare module 'stripe' {
  namespace Stripe {
    interface Subscription {
      current_period_end: number;
      current_period_start: number;
      cancel_at_period_end: boolean;
    }
    interface Invoice {
      subscription: string | Stripe.Subscription | null;
    }
  }
}

export {};
