import { useState, useEffect } from "react";

const DISMISSED_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    return window.matchMedia("(display-mode: standalone)").matches;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const mq = window.matchMedia("(display-mode: standalone)");
    const mqHandler = (e: MediaQueryListEvent) => {
      if (e.matches) setIsInstalled(true);
    };
    mq.addEventListener("change", mqHandler);

    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      mq.removeEventListener("change", mqHandler);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // ignore
    }
    setIsDismissed(true);
  };

  const showBanner = !!deferredPrompt && !isDismissed && !isInstalled;

  return { showBanner, promptInstall, dismiss };
}
