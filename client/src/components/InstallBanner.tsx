import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export function InstallBanner() {
  const { showBanner, promptInstall, dismiss } = useInstallPrompt();

  if (!showBanner) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm animate-fade-in">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
        <Download className="h-4 w-4 text-green-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-green-900 leading-snug">Add Quikpik to your home screen</p>
        <p className="text-green-700 text-xs mt-0.5 leading-snug">Get the full app experience — faster and offline-ready.</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          className="h-8 bg-green-700 hover:bg-green-800 text-white text-xs px-3"
          onClick={promptInstall}
        >
          Install
        </Button>
        <button
          aria-label="Dismiss install banner"
          onClick={dismiss}
          className="text-green-600 hover:text-green-900 transition-colors p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
