import { logServerError } from "../lib/errorLogger";

export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function logServiceError(
  service: string,
  endpoint: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  await logServerError(service, message, {
    context: { endpoint, ...context },
    severity: "warning",
  });
}
