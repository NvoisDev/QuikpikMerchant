import { Smartphone, X, Download } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export default function InstallPromptBanner() {
  const { isVisible, triggerInstall, dismiss } = usePwaInstall();

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[55] w-[calc(100%-2rem)] max-w-md">
      <div className="bg-white border border-green-100 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">Add to Home Screen</p>
          <p className="text-xs text-gray-500 leading-tight mt-0.5">
            Install Quikpik for quick access from your phone.
          </p>
        </div>

        <button
          onClick={triggerInstall}
          className="flex-shrink-0 flex items-center gap-1.5 bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Install
        </button>

        <button
          onClick={dismiss}
          className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
