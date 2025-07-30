import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import MemoryStore from "memorystore";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Set up trust proxy setting
  app.set("trust proxy", 1);

  // Session configuration
  const MemoryStoreSession = MemoryStore(session);
  app.use(session({
    store: new MemoryStoreSession({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    secret: process.env.SESSION_SECRET || 'your-session-secret-key-here',
    resave: false,
    saveUninitialized: false,
    name: 'sessionId',
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: false, // Allow client-side access for debugging
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    }
  }));

  // Authentication middleware - simplified
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    req.user = req.session.user;
    next();
  };

  // Google OAuth login route (existing working authentication)  
  app.get('/api/auth/google', (req, res) => {
    // Redirect to Google OAuth (this should be implemented by the original system)
    res.redirect('/dashboard'); // Temporary redirect
  });

  // Login endpoint for business owners
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      console.log(`🔐 Login attempt for: ${email}`);
      
      const user = await storage.authenticateUser(email, password);
      
      if (!user) {
        console.log(`❌ Authentication failed for: ${email}`);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Create session - ensure session exists first
      if (!(req as any).session) {
        console.error("Session not initialized");
        return res.status(500).json({ error: "Session configuration error" });
      }
      
      (req as any).session.userId = user.id;
      (req as any).session.user = user;

      console.log(`✅ User logged in successfully: ${user.email}`);
      res.json({ success: true, user });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    (req as any).session.destroy((err: any) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  // User authentication endpoint
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const freshUserData = await storage.getUser(userId);
      
      console.log(`👤 Auth endpoint returning fresh user data for ${userId}:`, {
        id: freshUserData.id,
        email: freshUserData.email,
        subscriptionTier: freshUserData.subscriptionTier,
        subscriptionStatus: freshUserData.subscriptionStatus
      });
      
      res.json(freshUserData);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Subscription status endpoint
  app.get('/api/subscription/status', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      console.log(`📊 Subscription status check for user ${userId}: tier=${user.subscriptionTier}, status=${user.subscriptionStatus}`);
      
      const subscriptionData = {
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        productCount: 0, // Will be populated by product count query
        productLimit: user.productLimit || 3,
        editLimit: user.subscriptionTier === 'premium' ? -1 : (user.subscriptionTier === 'standard' ? 10 : 3),
        customerGroupLimit: user.subscriptionTier === 'premium' ? -1 : (user.subscriptionTier === 'standard' ? 5 : 2),
        broadcastLimit: user.subscriptionTier === 'premium' ? -1 : (user.subscriptionTier === 'standard' ? 25 : 10),
        customersPerGroupLimit: user.subscriptionTier === 'premium' ? -1 : (user.subscriptionTier === 'standard' ? 50 : 20),
        teamMemberCount: 0,
        teamMemberLimit: user.subscriptionTier === 'premium' ? 5 : (user.subscriptionTier === 'standard' ? 2 : 0),
        isTeamMember: user.role === 'team_member',
        expiresAt: user.subscriptionEndsAt?.toISOString() || null
      };

      res.json(subscriptionData);
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });

  // Products endpoint
  app.get('/api/products', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log('Products request - Target user ID:', targetUserId);
      
      const products = await storage.getProducts(targetUserId);
      console.log('Products found:', products.length);
      
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Create HTTP server
  const httpServer = createServer(app);
  return httpServer;
}