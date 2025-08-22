// Temporary test auth bypass for development
import { Request, Response, NextFunction } from 'express';

export const testAuthBypass = (req: Request, res: Response, next: NextFunction) => {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: "Not found" });
  }
  
  // Create a fake user session for testing
  req.user = {
    id: 'test-user-123',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    businessName: 'Test Business',
    role: 'wholesaler',
    logoType: 'business',
    logoUrl: ''
  };
  
  next();
};