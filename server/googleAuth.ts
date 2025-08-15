import { OAuth2Client } from 'google-auth-library';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Google OAuth credentials are required');
}

// Fixed redirect URI system - always use quikpik.app for consistency
const getRedirectUri = () => {
  // Always use the production domain for OAuth consistency
  // This prevents redirect URI mismatches across different environments
  return 'https://quikpik.app/api/auth/google/callback';
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
    console.log('🔍 Verifying Google token with code:', code.substring(0, 10) + '...');
    
    const { tokens } = await client.getToken(code);
    console.log('✅ Received tokens from Google');
    
    client.setCredentials(tokens);

    if (!tokens.id_token) {
      throw new Error('No ID token received from Google');
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('No payload found in Google token');
    }

    console.log('✅ Google token verified for user:', payload.email);

    return {
      id: payload.sub!,
      email: payload.email!,
      name: payload.name!,
      picture: payload.picture || '',
      given_name: payload.given_name,
      family_name: payload.family_name
    };
  } catch (error) {
    console.error('❌ Error verifying Google token:', error);
    throw new Error(`Failed to verify Google token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function createOrUpdateUser(googleUser: GoogleUser) {
  try {
    console.log('🔍 Looking for existing user with email:', googleUser.email);
    
    // Check if user exists
    let user = await storage.getUserByEmail(googleUser.email);
    
    if (user) {
      console.log('✅ Found existing user, updating Google info for:', user.email);
      
      // Update existing user with Google info and mark as not first login
      // Only update fields that are safe to update
      const updateData: any = {
        googleId: googleUser.id,
        isFirstLogin: false
      };
      
      // Only update profile image if it's not already set
      if (googleUser.picture && !user.profileImageUrl) {
        updateData.profileImageUrl = googleUser.picture;
      }
      
      // Only update names if they're not already set
      if (googleUser.given_name && !user.firstName) {
        updateData.firstName = googleUser.given_name;
      }
      if (googleUser.family_name && !user.lastName) {
        updateData.lastName = googleUser.family_name;
      }
      
      user = await storage.updateUser(user.id, updateData);
      console.log('✅ Updated existing user successfully');
    } else {
      console.log('🆕 Creating new user for:', googleUser.email);
      
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
      console.log('✅ Created new user successfully');
    }

    return user;
  } catch (error) {
    console.error('❌ Error creating/updating user:', error);
    console.error('❌ Error details:', error instanceof Error ? error.stack : error);
    throw new Error(`Failed to create or update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
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