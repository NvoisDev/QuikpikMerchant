import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { formatCurrency } from "@shared/utils/currency";
import {
  LayoutDashboard, Building2, Users, ShoppingCart, Package, TrendingUp,
  Settings, CreditCard, MapPin, Activity, BadgeCheck, Archive,
} from "lucide-react";
import type { SectionId } from "./types";

export const GREEN  = "#1a7a3d";
export const BLUE   = "#1d4ed8";
export const AMBER  = "#b45309";
export const PURPLE = "#7c3aed";
export const RED    = "#dc2626";

export const fmt = (n: number) => formatCurrency(n || 0, 'GBP');

export const pct = (num: number, denom: number) =>
  denom > 0 ? `${((num / denom) * 100).toFixed(1)}%` : "—";

export const toISODate = (d: Date) => d.toISOString().split("T")[0];

export const planBadge = (tier: string | null) => {
  if (!tier || tier === "free" || tier === "listing" || tier.startsWith("listing_"))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">Listing</span>;
  if (tier === "starter" || tier.startsWith("starter_"))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Starter</span>;
  if (tier === "standard" || tier.startsWith("standard_"))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Standard</span>;
  if (tier === "premium" || tier.startsWith("premium_"))
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">Premium</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">{tier}</span>;
};

export const customPriceDaysRemaining = (expiresAt: string | null | undefined): number | null => {
  if (!expiresAt) return null;
  const ts = new Date(expiresAt).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
};

export const SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview",    label: "Overview",         icon: LayoutDashboard },
  { id: "wholesalers", label: "Wholesalers",       icon: Building2 },
  { id: "customers",   label: "Customers",         icon: Users },
  { id: "orders",      label: "Orders",            icon: ShoppingCart },
  { id: "products",    label: "Products",          icon: Package },
  { id: "financials",  label: "Financials",        icon: TrendingUp },
  { id: "settings",    label: "System Settings",   icon: Settings },
  { id: "plans",       label: "Plans",             icon: CreditCard },
  { id: "map",         label: "Customer Map",      icon: MapPin },
  { id: "logs",        label: "Support & Logs",    icon: Activity },
];

export type Preset = "this_month" | "last_month" | "last_3_months" | "all_time";
export const PRESETS: { id: Preset; label: string }[] = [
  { id: "this_month",    label: "This month" },
  { id: "last_month",    label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "all_time",      label: "All time" },
];

export function presetToDates(p: Preset): { from: string; to: string } | null {
  const now = new Date();
  if (p === "this_month")    return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) };
  if (p === "last_month")    { const m = subMonths(now, 1); return { from: toISODate(startOfMonth(m)), to: toISODate(endOfMonth(m)) }; }
  if (p === "last_3_months") return { from: toISODate(startOfMonth(subMonths(now, 2))), to: toISODate(endOfDay(now)) };
  return null;
}

export function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub: string; icon: React.ReactNode; color: string;
}) {
  const bgMap: Record<string, string> = {
    [GREEN]:  "#f0faf4", [BLUE]: "#eff6ff", [AMBER]: "#fffbeb", [PURPLE]: "#f5f3ff", [RED]: "#fef2f2",
  };
  const bg = bgMap[color] || "#f9fafb";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg, color }}>{icon}</div>
      </div>
      <p className="text-xl font-bold leading-tight" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

export function Row({ label, value, bold, color }: { label: string; value: string | number; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs ${bold ? "font-bold" : "font-medium"}`} style={{ color: color || "#374151" }}>{value}</span>
    </div>
  );
}

export { BadgeCheck, Archive };
