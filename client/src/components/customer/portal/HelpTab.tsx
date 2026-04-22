import CustomerHelp from "@/components/customer/CustomerHelp";
import { TabQuickActions } from "./TabQuickActions";
import type { CartItem } from "@/components/customer/portal-types";

interface HelpTabProps {
  wholesaler: {
    businessName?: string;
    phoneNumber?: string | null;
    businessPhone?: string | null;
    email?: string | null;
  } | null | undefined;
  setActiveTab: (tab: string) => void;
  cart: CartItem[];
  setShowCheckout: (show: boolean) => void;
  isCreatingIntent: boolean;
  handleLogout: () => void;
}

export function HelpTab({
  wholesaler,
  setActiveTab,
  cart,
  setShowCheckout,
  isCreatingIntent,
  handleLogout,
}: HelpTabProps) {
  return (
    <>
      <TabQuickActions
        setActiveTab={setActiveTab}
        cart={cart}
        setShowCheckout={setShowCheckout}
        isCreatingIntent={isCreatingIntent}
        handleLogout={handleLogout}
      />
      <CustomerHelp wholesaler={wholesaler ? {
        businessName: wholesaler.businessName,
        phoneNumber: wholesaler.phoneNumber ?? undefined,
        businessPhone: wholesaler.businessPhone ?? undefined,
        email: wholesaler.email ?? undefined,
      } : undefined} />
    </>
  );
}
