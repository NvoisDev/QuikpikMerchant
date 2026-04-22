import Logo from "@/components/ui/logo";
import { Check } from "lucide-react";

interface StoreSwitcherStore {
  id: string;
  businessName?: string;
  storeTagline?: string;
  logoType?: string;
  logoUrl?: string;
  firstName?: string;
  lastName?: string;
}

interface StoreSwitcherProps {
  showStoreSwitcher: boolean;
  setShowStoreSwitcher: (v: boolean) => void;
  authenticatedCustomer: { firstName?: string; name?: string; lastName?: string; phone?: string } | null;
  switcherStores: StoreSwitcherStore[];
  switcherStoresLoading: boolean;
  wholesalerId: string;
  setIsSwitchingWholesaler: (v: boolean) => void;
  setLocation: (path: string) => void;
}

export function StoreSwitcher({
  showStoreSwitcher,
  setShowStoreSwitcher,
  authenticatedCustomer,
  switcherStores,
  switcherStoresLoading,
  wholesalerId,
  setIsSwitchingWholesaler,
  setLocation,
}: StoreSwitcherProps) {
  if (!showStoreSwitcher) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setShowStoreSwitcher(false)}
      />
      <div className="relative bg-white rounded-t-3xl shadow-xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pt-3 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-theme-secondary flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-theme-primary">
                {(() => {
                  const name = authenticatedCustomer?.firstName || authenticatedCustomer?.name || '';
                  return name.split(' ').map((w: string) => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
                })()}
              </span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {authenticatedCustomer?.firstName
                  ? `${authenticatedCustomer.firstName}${authenticatedCustomer.lastName ? ' ' + authenticatedCustomer.lastName : ''}`
                  : authenticatedCustomer?.name || 'My Account'}
              </p>
              <p className="text-xs text-gray-500">{authenticatedCustomer?.phone || ''}</p>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">Your Stores</p>
          {switcherStores.map((w) => {
            const isActive = w.id === wholesalerId;
            return (
              <button
                key={w.id}
                onClick={async () => {
                  if (isActive) { setShowStoreSwitcher(false); return; }
                  setShowStoreSwitcher(false);
                  setIsSwitchingWholesaler(true);
                  try {
                    await fetch('/api/customer-auth/switch-wholesaler', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ targetWholesalerId: w.id })
                    });
                  } catch {
                    // continue even if switch-wholesaler fails — session check will handle auth
                  }
                  setLocation(`/store/${w.id}`);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl mb-1 transition-colors text-left ${isActive ? 'bg-theme-secondary' : 'hover:bg-gray-50 active:bg-gray-100'}`}
              >
                <Logo
                  size="md"
                  variant="icon-only"
                  className="flex-shrink-0 w-11 h-11 rounded-xl"
                  user={{
                    logoType: w.logoType || 'business',
                    logoUrl: w.logoUrl,
                    businessName: w.businessName,
                    firstName: w.firstName,
                    lastName: w.lastName
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${isActive ? 'text-theme-primary' : 'text-gray-900'}`}>
                    {w.businessName || 'Business'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{w.storeTagline || 'Wholesale products'}</p>
                </div>
                {isActive && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-theme-primary flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
          {switcherStoresLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin" />
            </div>
          ) : switcherStores.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No stores available</p>
          )}
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
