import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

export function useVersionCheck() {
  const knownVersion = useRef<number | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = await res.json();
        if (knownVersion.current === null) {
          knownVersion.current = version;
        } else if (version !== knownVersion.current) {
          setUpdateAvailable(true);
        }
      } catch {
        // network blip — ignore, try again next interval
      }
    }

    check();
    timer = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return updateAvailable;
}
