import { db } from "../db";
import { systemErrorLogs } from "../../shared/schema";

export async function logServerError(
  errorType: string,
  message: string,
  options: {
    context?: Record<string, unknown>;
    wholesalerId?: string;
    severity?: "error" | "warning" | "critical";
  } = {}
): Promise<void> {
  const { context = {}, wholesalerId, severity = "error" } = options;
  try {
    await db.insert(systemErrorLogs).values({
      errorType,
      message: message.slice(0, 2000),
      context,
      wholesalerId: wholesalerId || null,
      severity,
    });
  } catch (logErr) {
    // Intentionally silent — logging failures must not crash the app
    console.error("[errorLogger] Failed to write to system_error_logs:", logErr);
  }
}
