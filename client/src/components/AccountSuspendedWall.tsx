import { useAuth } from "@/hooks/useAuth";
import { Shield, Mail, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccountSuspendedWall({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();

  if (isLoading || !(user as any)?.archived) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 bg-red-900/40 rounded-full flex items-center justify-center ring-2 ring-red-800/50">
            <Shield className="w-7 h-7 text-red-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          Your account has been suspended
        </h1>

        <p className="text-slate-400 mb-5 leading-relaxed">
          Your Quikpik wholesaler account has been suspended by the platform team.
          Access to your dashboard, store, and all platform features is currently paused.
        </p>

        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-6 text-left">
          <p className="text-slate-300 text-sm font-semibold mb-2">What this means</p>
          <ul className="text-slate-400 text-sm space-y-1.5">
            <li>• Your products are temporarily hidden from the marketplace</li>
            <li>• Customers cannot place new orders through your store</li>
            <li>• Your account data — products, orders, and customers — is safely preserved</li>
            <li>• Everything will be fully restored if your account is reinstated</li>
          </ul>
        </div>

        <p className="text-slate-400 text-sm mb-5">
          To discuss or appeal this suspension, contact the Quikpik team directly:
        </p>

        <a
          href="mailto:hello@quikpik.co?subject=Account%20Suspension%20-%20Appeal"
          className="flex items-center justify-center gap-2 w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg mb-3 transition-colors"
        >
          <Mail className="w-4 h-4" />
          Email hello@quikpik.co
        </a>

        <Button
          variant="ghost"
          onClick={() => logout()}
          className="w-full text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>

        <p className="mt-6 text-xs text-slate-600">
          If you believe this is a mistake, we're here to help — reach out at{" "}
          <a href="mailto:hello@quikpik.co" className="text-slate-500 underline">
            hello@quikpik.co
          </a>
        </p>
      </div>
    </div>
  );
}
