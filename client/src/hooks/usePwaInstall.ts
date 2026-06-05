import { useState, useEffect } from "react";

const DISMISSED_KEY = "pwa_install_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const appInstalledHandler = () => {
      setPromptEvent(null);
      try {
        localStorage.setItem(DISMISSED_KEY, "true");
      } catch {}
      setIsDismissed(true);
    };

    window.addEventListener("appinstalled", appInstalledHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const triggerInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    if (outcome === "accepted") {
      try {
        localStorage.setItem(DISMISSED_KEY, "true");
      } catch {}
      setIsDismissed(true);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {}
    setIsDismissed(true);
    setPromptEvent(null);
  };

  const isVisible = !!promptEvent && !isDismissed;

  return { isVisible, triggerInstall, dismiss };
}
