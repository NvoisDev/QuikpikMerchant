import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

const PING_INTERVAL_MS = 60_000;

export function usePresencePing(isAuthenticated: boolean) {
  useEffect(() => {
    if (!isAuthenticated) return;

    const ping = () => {
      apiRequest("POST", "/api/auth/ping").catch(() => {});
    };

    ping();

    const intervalId = setInterval(ping, PING_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isAuthenticated]);
}
