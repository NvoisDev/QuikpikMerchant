import { type Request, type Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";

export async function healthCheck(req: Request, res: Response) {
  try {
    await db.execute(sql`SELECT 1`);
    
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

const DB_ATTEMPT_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function validateDatabaseConnection(
  maxAttempts = 8,
  baseDelayMs = 3000,
  maxDelayMs = 30000,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await withTimeout(db.execute(sql`SELECT 1`), DB_ATTEMPT_TIMEOUT_MS, `DB attempt ${attempt}`);
      console.log("✅ Database connection validated successfully");
      return true;
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      if (isLastAttempt) {
        console.error("❌ Database connection validation failed after all attempts:", error);
        return false;
      }
      const delayMs = Math.min(baseDelayMs * attempt, maxDelayMs);
      console.warn(`⚠️  Database connection attempt ${attempt}/${maxAttempts} failed — retrying in ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
