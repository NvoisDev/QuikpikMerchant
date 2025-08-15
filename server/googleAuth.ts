import { OAuth2Client } from 'google-auth-library';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Google OAuth credentials are required');
}

// Flexible redirect URI system for different environments
const getRedirectUri = () => {
  // Check if we're on Replit development environment
  if (process.env.REPLIT_CLUSTER || process.env.REPL_ID) {
    // Use the current Replit domain for development
    const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (replitDomain) {
      return `https://${replitDomain}/api/auth/google/callback`;
    }
  }
  
  // HARDCODE for production deployment until environment variables work
  // This forces quikpik.app domain for all production deployments
  if (process.env.NODE_ENV === 'production' || process.env.CUSTOM_DOMAIN) {
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
    // Debug session information
    console.log('🔍 Auth Debug:', {
      sessionExists: !!req.session,
      sessionUser: req.session?.user ? 'exists' : 'missing',
      sessionUserId: req.session?.userId || 'missing',
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : 'no_method',
      headers: req.headers.cookie ? 'has_cookies' : 'no_cookies'
    });

    // Check for session user object (primary method for email/password auth)
    const sessionUser = req.session?.user;
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
        
        console.log(`✅ Session auth successful for user ${user.email}`);
        // Use session data which includes team member context
        req.user = sessionUser;
        return next();
      }
    }

    // Check for legacy session userId (fallback)
    const sessionUserId = req.session?.userId;
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
        
        console.log(`✅ Legacy session auth successful for user ${user.email}`);
        req.user = user;
        return next();
      }
    }

    // Check for Replit OAuth session
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const user = req.user;
      
      // SECURITY: Block customer/retailer access to wholesaler dashboard
      if (user.role === 'retailer' || user.role === 'customer') {
        console.log(`🚫 SECURITY: Blocked ${user.role} (${user.email}) from accessing wholesaler dashboard`);
        return res.status(403).json({ 
          error: 'Access denied. Customers cannot access the wholesaler dashboard.',
          userType: user.role,
          redirectUrl: '/customer-login'
        });
      }
      
      return next();
    }

    return res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};