import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface FeatureLockProps {
  feature: string;
  description?: string;
}

/**
 * Shown in place of a blocked feature for Listing-tier users.
 * Displays a tasteful lock card with an "Upgrade to Starter" CTA.
 */
export function FeatureLock({ feature, description }: FeatureLockProps) {
  return (
    <div className="flex items-center justify-center min-h-[320px] p-8">
      <div className="text-center max-w-sm">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 mx-auto mb-4">
          <Lock className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{feature} not available</h3>
        <p className="text-sm text-gray-500 mb-5">
          {description ?? `${feature} is available on the Starter plan and above. Upgrade to unlock full operational access.`}
        </p>
        <Link href="/subscription/pricing">
          <Button className="bg-green-600 hover:bg-green-700 text-white">
            Upgrade to Starter
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * Returns true if the given plan tier is the Listing discovery tier.
 */
export function isListingTier(plan?: string): boolean {
  if (!plan) return false;
  return plan === 'listing' || plan.startsWith('listing_');
}
