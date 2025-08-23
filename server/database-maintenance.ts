// Database maintenance utilities to prevent table bloat and manage storage
import { storage } from "./storage";
import cron from "node-cron";

export class DatabaseMaintenance {
  private static isRunning = false;

  // Run maintenance tasks every hour
  static startAutomaticMaintenance() {
    if (this.isRunning) return;
    
    console.log("🔧 Starting automatic database maintenance scheduler");
    
    // Every hour at minute 0
    cron.schedule('0 * * * *', async () => {
      await this.runMaintenanceTasks();
    });
    
    this.isRunning = true;
  }

  // Run all maintenance tasks
  static async runMaintenanceTasks() {
    try {
      console.log("🧹 Starting scheduled database maintenance...");
      
      // Clean up expired sessions
      await storage.cleanupExpiredSessions();
      
      // Clean up expired SMS codes
      await storage.cleanupExpiredSMSCodes();
      
      // Additional cleanup tasks can be added here
      
      console.log("✅ Database maintenance completed successfully");
    } catch (error) {
      console.error("❌ Database maintenance failed:", error);
    }
  }

  // Manual maintenance for immediate cleanup
  static async runImmediateMaintenance() {
    console.log("🚀 Running immediate database maintenance...");
    await this.runMaintenanceTasks();
  }
}

// Export convenience function
export const startDatabaseMaintenance = () => {
  DatabaseMaintenance.startAutomaticMaintenance();
};