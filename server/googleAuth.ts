import { OAuth2Client } from 'google-auth-library';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Google OAuth credentials are required');
}

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5000/api/auth/google/callback'
    : `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}/api/auth/google/callback`
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
      user = await storage.createUser({
        id: googleUser.id,
        email: googleUser.email,
        firstName: googleUser.given_name || googleUser.name.split(' ')[0],
        lastName: googleUser.family_name || googleUser.name.split(' ').slice(1).join(' '),
        profileImageUrl: googleUser.picture,
        googleId: googleUser.id,
        role: 'wholesaler', // Default role
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
    const userId = req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};