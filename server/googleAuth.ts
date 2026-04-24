import { OAuth2Client } from 'google-auth-library';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { ADMIN_EMAILS } from './config';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Google OAuth credentials are required');
}

// Flexible redirect URI system for different environments
const getRedirectUri = () => {
  // PRODUCTION ONLY: Force quikpik.app domain when NODE_ENV is production
  if (process.env.NODE_ENV === 'production') {
    return 'https://quikpik.app/api/auth/google/callback';
  }
  
  // DEVELOPMENT: Use Replit dev domain for development
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
  }
  
  // Custom redirect URI override for development
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }
  
  // Fallback for local development
  return 'http://localhost:5000/api/auth/google/callback';
};

const redirectUri = getRedirectUri();
console.log('Google OAuth redirect URI:', redirectUri);

// Log helpful information for OAuth setup
console.log('🔧 Google OAuth Setup Information:');
console.log('📋 Add this redirect URI to your Google Cloud Console:');
console.log(`   ${redirectUri}`);
console.log('🌐 Google Cloud Console: https://console.cloud.google.com/apis/credentials');

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
);

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  given_name?: string;
  family_name?: string;
}

export function getGoogleAuthUrl(): string {
  const scopes = ['email', 'profile'];
  
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'select_account'
  });
}

export async function verifyGoogleToken(code: string): Promise<GoogleUser> {
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('No payload found in Google token');
    }

    return {
      id: payload.sub,
      email: payload.email!,
      name: payload.name!,
      picture: payload.picture!,
      given_name: payload.given_name,
      family_name: payload.family_name
    };
  } catch (error) {
    console.error('Error verifying Google token:', error);
    throw new Error('Failed to verify Google token');
  }
}

export async function createOrUpdateUser(googleUser: GoogleUser) {
  try {
    // Step 1: Look up by Google ID first — most precise match, handles returning users
    let user = await storage.getUserByGoogleId(googleUser.id);

    if (user) {
      // SECURITY: If the matched record is a team_member or non-wholesaler, do NOT sign
      // them in as that role — create a fresh wholesaler account instead. A team_member's
      // googleId can end up set on their record from a previous sign-in attempt, but they
      // should always get their own separate business account via Google OAuth.
      const SIGNABLE_ROLES = ['wholesaler', 'admin'];
      if (!SIGNABLE_ROLES.includes(user.role)) {
        console.log(`⚠️  googleId match found a ${user.role} record (id: ${user.id}) — creating fresh wholesaler account to prevent data collision`);
        const newUser = await storage.createUser({
          id: googleUser.id,
          email: googleUser.email,
          firstName: googleUser.given_name || googleUser.name.split(' ')[0],
          lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
          profileImageUrl: googleUser.picture,
          googleId: googleUser.id,
          role: 'wholesaler',
          businessName: `${googleUser.name}'s Business`,
          defaultCurrency: 'GBP',
          isFirstLogin: true
        });
        return newUser;
      }

      // Returning wholesaler/admin already linked to this Google account — update profile and sign in
      console.log(`✅ Found existing ${user.role} by googleId: ${user.email}`);
      user = await storage.updateUser(user.id, {
        firstName: googleUser.given_name || googleUser.name.split(' ')[0],
        lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
        profileImageUrl: googleUser.picture,
        googleId: googleUser.id,
        isFirstLogin: false
      });
      return user;
    }

    // Step 2: No Google-ID match — fetch ALL records with this email and pick
    // deterministically using role-priority: wholesaler > admin > team_member > others
    const emailUsers = await storage.getAllUsersByEmail(googleUser.email);

    if (emailUsers.length > 0) {
      // Priority order for existing records that can be linked via Google sign-in
      const LINKABLE_ROLES = ['wholesaler', 'admin'];

      // Pick the best linkable candidate (wholesaler/admin without a different googleId)
      const linkable = emailUsers.find(
        u => LINKABLE_ROLES.includes(u.role) && (!u.googleId || u.googleId === googleUser.id)
      );

      if (linkable) {
        // Existing wholesaler/admin — link Google account and sign in
        console.log(`🔗 Linking Google account to existing ${linkable.role}: ${linkable.email} (id: ${linkable.id})`);
        user = await storage.updateUser(linkable.id, {
          firstName: googleUser.given_name || googleUser.name.split(' ')[0],
          lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
          profileImageUrl: googleUser.picture,
          googleId: googleUser.id,
          isFirstLogin: false
        });
        return user;
      }

      // SECURITY: All email matches are non-wholesaler records (e.g. team_member, retailer,
      // customer) that have never been Google-linked. Do NOT bind this sign-in to any of
      // those records — create a fresh wholesaler account instead.
      const roles = emailUsers.map(u => u.role).join(', ');
      console.log(`⚠️  Email ${googleUser.email} matched only [${roles}] records — creating a fresh wholesaler account to prevent data collision`);
      user = await storage.createUser({
        id: googleUser.id,
        email: googleUser.email,
        firstName: googleUser.given_name || googleUser.name.split(' ')[0],
        lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
        profileImageUrl: googleUser.picture,
        googleId: googleUser.id,
        role: 'wholesaler',
        businessName: `${googleUser.name}'s Business`,
        defaultCurrency: 'GBP',
        isFirstLogin: true
      });
      return user;
    }

    // Step 3: Completely new user — create fresh wholesaler account
    // SECURITY: All Google OAuth users are wholesalers by default
    // Customers use separate SMS-based authentication system
    console.log(`🆕 Creating new wholesaler account for ${googleUser.email}`);
    user = await storage.createUser({
      id: googleUser.id,
      email: googleUser.email,
      firstName: googleUser.given_name || googleUser.name.split(' ')[0],
      lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
      profileImageUrl: googleUser.picture,
      googleId: googleUser.id,
      role: 'wholesaler',
      businessName: `${googleUser.name}'s Business`,
      defaultCurrency: 'GBP',
      isFirstLogin: true
    });

    return user;
  } catch (error) {
    console.error('Error creating/updating user:', error);
    throw new Error('Failed to create or update user');
  }
}

// New auth middleware that allows both wholesalers and retailers (for subscriptions, etc.)
export const requireAnyAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Enhanced session debugging
    const sessionUser = (req.session as any)?.user;
    const sessionUserId = (req.session as any)?.userId;
    
    console.log('🔍 Auth Debug (Any Role):', {
      sessionExists: !!req.session,
      sessionId: req.sessionID?.substring(0, 8),
      sessionUser: sessionUser ? 'present' : 'missing',
      sessionUserId: sessionUserId ? 'present' : 'missing',
      url: req.url
    });
    
    if (sessionUser && sessionUser.id) {
      const user = await storage.getUser(sessionUser.id);
      if (user) {
        console.log(`✅ Auth successful for ${user.email} (${user.role}) (${req.method} ${req.url})`);
        req.user = user;
        return next();
      }
    }

    // Check for legacy session userId (fallback)
    if (sessionUserId) {
      const user = await storage.getUser(sessionUserId);
      if (user) {
        console.log(`✅ Legacy auth successful for ${user.email} (${user.role}) (${req.method} ${req.url})`);
        req.user = user;
        
        // Update session for consistency
        (req.session as any).user = user;
        return next();
      }
    }

    // Check for Replit OAuth session (Passport.js integration)
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const user = req.user as any;
      console.log(`✅ OAuth auth successful for ${user.email} (${user.role}) (${req.method} ${req.url})`);
      return next();
    }

    console.log('🔄 Session exists but user data missing - session may have expired');
    
    return res.status(401).json({
      error: 'Authentication required',
      sessionExists: !!req.session,
      sessionId: req.sessionID?.substring(0, 8)
    });
    
  } catch (error) {
    console.error('❌ Auth error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Enhanced session debugging
    const sessionUser = (req.session as any)?.user;
    const sessionUserId = (req.session as any)?.userId;
    
    console.log('🔍 Auth Debug:', {
      sessionExists: !!req.session,
      sessionId: req.sessionID?.substring(0, 8),
      sessionUser: sessionUser ? 'present' : 'missing',
      sessionUserId: sessionUserId ? 'present' : 'missing',
      url: req.url
    });
    
    if (sessionUser && sessionUser.id) {
      const user = await storage.getUser(sessionUser.id);
      if (user) {
        // SECURITY: Block customer/retailer access to wholesaler dashboard
        if (user.role === 'retailer' || user.role === 'customer') {
          console.log(`🚫 SECURITY: Blocked ${user.role} (${user.email}) from accessing wholesaler dashboard`);
          return res.status(403).json({ 
            error: 'Access denied. Customers cannot access the wholesaler dashboard.',
            userType: user.role,
            redirectUrl: '/customer-login'
          });
        }
        
        // Handle admin impersonation via server-issued token (proves audited start)
        const impersonateHeader = req.headers['x-admin-impersonate'] as string | undefined;
        const impersonateToken = req.headers['x-impersonate-token'] as string | undefined;
        const sessionToken = (req.session as any).impersonationToken as { token: string; wholesalerId: string; adminEmail: string; expiresAt?: number } | undefined;
        if (
          impersonateHeader && impersonateToken && ADMIN_EMAILS.includes(user.email || '') &&
          sessionToken &&
          sessionToken.token === impersonateToken &&
          sessionToken.wholesalerId === impersonateHeader &&
          (!sessionToken.expiresAt || Date.now() < sessionToken.expiresAt)
        ) {
          const wholesalerUser = await storage.getUser(impersonateHeader);
          if (wholesalerUser && wholesalerUser.role === 'wholesaler') {
            (req as any)._adminEmail = user.email;
            (req as any)._impersonatingBusinessName = wholesalerUser.businessName;
            req.user = wholesalerUser;
            console.log(`🎭 Admin ${user.email} impersonating wholesaler ${wholesalerUser.email} (${req.method} ${req.url})`);
            return next();
          }
        }
        
        console.log(`✅ Auth successful for ${user.email} (${req.method} ${req.url})`);
        req.user = user;
        return next();
      }
    }

    // Check for legacy session userId (fallback)
    if (sessionUserId) {
      const user = await storage.getUser(sessionUserId);
      if (user) {
        // SECURITY: Block customer/retailer access to wholesaler dashboard
        if (user.role === 'retailer' || user.role === 'customer') {
          console.log(`🚫 SECURITY: Blocked ${user.role} (${user.email}) from accessing wholesaler dashboard`);
          return res.status(403).json({ 
            error: 'Access denied. Customers cannot access the wholesaler dashboard.',
            userType: user.role,
            redirectUrl: '/customer-login'
          });
        }
        
        // Handle admin impersonation via server-issued token (proves audited start)
        const impersonateHeaderLegacy = req.headers['x-admin-impersonate'] as string | undefined;
        const impersonateTokenLegacy = req.headers['x-impersonate-token'] as string | undefined;
        const sessionTokenLegacy = (req.session as any).impersonationToken as { token: string; wholesalerId: string; expiresAt?: number } | undefined;
        if (
          impersonateHeaderLegacy && impersonateTokenLegacy && ADMIN_EMAILS.includes(user.email || '') &&
          sessionTokenLegacy &&
          sessionTokenLegacy.token === impersonateTokenLegacy &&
          sessionTokenLegacy.wholesalerId === impersonateHeaderLegacy &&
          (!sessionTokenLegacy.expiresAt || Date.now() < sessionTokenLegacy.expiresAt)
        ) {
          const wholesalerUser = await storage.getUser(impersonateHeaderLegacy);
          if (wholesalerUser && wholesalerUser.role === 'wholesaler') {
            (req as any)._adminEmail = user.email;
            (req as any)._impersonatingBusinessName = wholesalerUser.businessName;
            req.user = wholesalerUser;
            return next();
          }
        }
        
        console.log(`✅ Legacy auth successful for ${user.email} (${req.method} ${req.url})`);
        req.user = user;
        
        // Update session for consistency
        (req.session as any).user = user;
        return next();
      }
    }

    // Check for Replit OAuth session (Passport.js integration)
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const user = req.user as any;
      
      // SECURITY: Block customer/retailer access to wholesaler dashboard
      if (user.role === 'retailer' || user.role === 'customer') {
        console.log(`🚫 SECURITY: Blocked ${user.role} (${user.email}) from accessing wholesaler dashboard`);
        return res.status(403).json({ 
          error: 'Access denied. Customers cannot access the wholesaler dashboard.',
          userType: user.role,
          redirectUrl: '/customer-login'
        });
      }
      
      console.log(`✅ Replit OAuth auth successful for user ${user.email || user.claims?.email} (${req.url})`);
      return next();
    }

    // Session Recovery: If session exists but user data is missing, provide clear guidance
    if (req.session && req.sessionID && !sessionUser && !sessionUserId) {
      console.log(`🔄 Session exists but user data missing - session may have expired`);
      return res.status(401).json({ 
        error: 'Authentication required',
        sessionExpired: true,
        message: 'Your session has expired. Please log in again.',
        redirectUrl: '/login'
      });
    }

    console.log('❌ No valid authentication found - proper login required');
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in to access this resource.',
      redirectUrl: '/login'
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// New session authentication function that works for both GET and POST
export async function authenticateSession(req: any): Promise<{
  success: boolean;
  user?: any;
  message?: string;
  debug?: any;
}> {
  try {
    // Extract session ID from cookies
    const sessionId = extractSessionIdFromCookies(req.headers.cookie);
    if (!sessionId) {
      return {
        success: false,
        message: 'No session cookie found',
        debug: { hasCookies: !!req.headers.cookie }
      };
    }

    // Get session data directly from the database
    const sessionResult = await db.execute(
      sql`SELECT sess FROM sessions WHERE sid = ${sessionId} AND expire > NOW()`
    );

    if (sessionResult.length === 0) {
      return {
        success: false,
        message: 'Session not found or expired',
        debug: { sessionId: sessionId.substring(0, 10) + '...' }
      };
    }

    const sessionData = JSON.parse(sessionResult[0].sess as string);
    
    // Check if we have passport user data
    if (!sessionData.passport?.user) {
      return {
        success: false,
        message: 'No user in session',
        debug: { hasPassport: !!sessionData.passport }
      };
    }

    // Get user from database using the session data
    const userClaims = sessionData.passport.user;
    if (!userClaims.sub) {
      return {
        success: false,
        message: 'Invalid user claims in session'
      };
    }

    const user = await storage.getUser(userClaims.sub);
    if (!user) {
      return {
        success: false,
        message: 'User not found in database'
      };
    }

    return {
      success: true,
      user: user
    };

  } catch (error) {
    console.error('Session authentication error:', error);
    return {
      success: false,
      message: 'Authentication error: ' + String(error)
    };
  }
}

// Helper function to extract session ID from cookie string
function extractSessionIdFromCookies(cookieString?: string): string | null {
  if (!cookieString) return null;
  
  const sessionMatch = cookieString.match(/connect\.sid=s%3A([^;]+)/);
  if (sessionMatch && sessionMatch[1]) {
    // Decode the session ID (it's URL encoded)
    return decodeURIComponent(sessionMatch[1]).split('.')[0];
  }
  
  return null;
}