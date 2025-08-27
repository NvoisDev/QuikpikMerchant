import { OAuth2Client } from 'google-auth-library';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Google OAuth credentials are required');
}

// Flexible redirect URI system for different environments
const getRedirectUri = () => {
  // HARDCODE for production deployment until environment variables work
  // This forces quikpik.app domain for all production deployments
  if (process.env.NODE_ENV === 'production' || 
      process.env.REPLIT_DOMAINS || 
      process.env.CUSTOM_DOMAIN) {
    return 'https://quikpik.app/api/auth/google/callback';
  }
  
  // Priority order for development
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }
  
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
    // Check if user exists
    let user = await storage.getUserByEmail(googleUser.email);
    
    if (user) {
      // Update existing user with Google info and mark as not first login
      user = await storage.updateUser(user.id, {
        firstName: googleUser.given_name || googleUser.name.split(' ')[0],
        lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
        profileImageUrl: googleUser.picture,
        googleId: googleUser.id,
        isFirstLogin: false
      });
    } else {
      // Create new user with first login flag
      // SECURITY: All Google OAuth users are wholesalers by default
      // Customers use separate SMS-based authentication system
      user = await storage.createUser({
        id: googleUser.id,
        email: googleUser.email,
        firstName: googleUser.given_name || googleUser.name.split(' ')[0],
        lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
        profileImageUrl: googleUser.picture,
        googleId: googleUser.id,
        role: 'wholesaler', // Default role - customers use separate auth
        businessName: `${googleUser.name}'s Business`,
        defaultCurrency: 'GBP',
        isFirstLogin: true
      });
    }

    return user;
  } catch (error) {
    console.error('Error creating/updating user:', error);
    throw new Error('Failed to create or update user');
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Enhanced debug session information
    console.log('🔍 Auth Debug:', {
      sessionExists: !!req.session,
      sessionUser: (req.session as any)?.user ? 'exists' : 'missing',
      sessionUserId: (req.session as any)?.userId || 'missing',
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : 'no_method',
      headers: req.headers.cookie ? 'has_cookies' : 'no_cookies',
      sessionId: req.sessionID || 'no_session_id',
      url: req.url,
      method: req.method,
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...'
    });

    // For POST requests, give session more time to initialize  
    if (req.method === 'POST' && (!req.session || !(req.session as any)?.user)) {
      console.log('⏳ POST request - waiting for session to initialize...');
      console.log('🔍 POST Debug - Headers:', {
        cookie: req.headers.cookie ? 'present' : 'missing',
        sessionId: req.sessionID || 'none',
        userAgent: req.headers['user-agent']?.substring(0, 50)
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force session reload for POST requests if still missing
      if (!req.session && req.headers.cookie) {
        console.log('🔄 Forcing session reload for POST request');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Standard session check after potential wait
    if (!req.session && req.headers.cookie) {
      console.log('⏳ Session not ready, waiting...');
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    // Check for session user object (primary method for email/password auth)
    const sessionUser = (req.session as any)?.user;
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
        
        console.log(`✅ Session auth successful for user ${user.email} (${req.url})`);
        // Ensure session user has the latest data from database
        const enrichedSessionUser = {
          ...sessionUser,
          ...user,
          role: user.role // Ensure role is from fresh database data
        };
        req.user = enrichedSessionUser;
        return next();
      } else {
        // User not found in database but session exists - clear session
        console.log('🔄 User not found in database but session exists, clearing session');
        delete (req.session as any)?.user;
        delete (req.session as any)?.userId;
      }
    }

    // Check for legacy session userId (fallback)
    const sessionUserId = (req.session as any)?.userId;
    if (sessionUserId) {
      const user = await storage.getUser(sessionUserId);
      if (user) {
        // SECURITY: Block customer/retailer access to wholesaler dashboard
        if (user.role === 'retailer' || user.role === 'customer') {
          console.log(`🚫 SECURITY: Blocked ${user.role} (${user.email}) from accessing wholesaler dashboard via legacy session`);
          return res.status(403).json({ 
            error: 'Access denied. Customers cannot access the wholesaler dashboard.',
            userType: user.role,
            redirectUrl: '/customer-login'
          });
        }
        
        console.log(`✅ Legacy session auth successful for user ${user.email} (${req.url})`);
        req.user = user;
        return next();
        // SECURITY: Block customer/retailer access to wholesaler dashboard
        if (user.role === 'retailer' || user.role === 'customer') {
          console.log(`🚫 SECURITY: Blocked ${user.role} (${user.email}) from accessing wholesaler dashboard`);
          return res.status(403).json({ 
            error: 'Access denied. Customers cannot access the wholesaler dashboard.',
            userType: user.role,
            redirectUrl: '/customer-login'
          });
        }
        
        console.log(`✅ Legacy session auth successful for user ${user.email} (${req.url})`);
        req.user = user;
        
        // Update session with full user object for consistency
        (req.session as any).user = user;
        return next();
      } else {
        // UserId exists but user not found - clear session
        console.log('🔄 Legacy userId exists but user not found, clearing session');
        delete (req.session as any)?.userId;
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