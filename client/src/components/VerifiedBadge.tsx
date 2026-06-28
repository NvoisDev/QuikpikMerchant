import { ShieldCheck } from "lucide-react";

interface VerifiedBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

export function VerifiedBadge({ className = "", size = "sm" }: VerifiedBadgeProps) {
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  const textSize = size === "md" ? "text-sm" : "text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 ${textSize} ${className}`}
      title="Business reviewed and approved by Quikpik"
    >
      <ShieldCheck className={iconSize} />
      Verified
    </span>
  );
}
