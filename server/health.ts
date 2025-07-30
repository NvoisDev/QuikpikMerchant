import { type Request, type Response } from "express";
import { db } from "./db";

export async function healthCheck(req: Request, res: Response) {
  try {
    // Check database connection
    await db.execute("SELECT 1");
    
    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: "connected",
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      database: "disconnected"
    });
  }
}

export async function validateDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute("SELECT 1");
    console.log("✅ Database connection validated successfully");
    return true;
  } catch (error) {
    console.error("❌ Database connection validation failed:", error);
    return false;
  }
}