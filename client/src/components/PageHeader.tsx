import { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Share2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: alertsData } = useQuery<{ count: number }>({
    queryKey: ["/api/stock-alerts/count"],
  });

  const handleShareStore = async () => {
    const effectiveUserId =
      user?.role === "team_member" && (user as any)?.wholesalerId
        ? (user as any).wholesalerId
        : user?.id;
    const customerPortalUrl = `https://quikpik.app/customer/${effectiveUserId}`;
    const businessName = user?.businessName || "My Store";

    const shareData = {
      title: `${businessName} - Wholesale Store`,
      text: `Check out ${businessName}! Browse our wholesale products and place orders directly.`,
      url: customerPortalUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast({ title: "Store Shared!", description: "Store link shared successfully!" });
        return;
      } catch (error) {
        if ((error as any)?.name !== "AbortError") {
          console.warn("Share API error:", error);
        }
      }
    }

    try {
      await navigator.clipboard.writeText(
        `${businessName}\n${customerPortalUrl}\n\nCheck out ${businessName} - browse our wholesale products and place orders directly!`
      );
      toast({
        title: "Store Link Copied!",
        description: "Store link copied to clipboard. Paste it anywhere to share!",
      });
    } catch {
      toast({
        title: "Share Store",
        description: `Copy this link: ${customerPortalUrl}`,
        duration: 8000,
      });
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h1>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {children}
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-gray-100"
            onClick={handleShareStore}
          >
            <Share2 className="h-5 w-5" />
          </Button>
          <Link href="/stock-alerts">
            <Button variant="ghost" size="icon" className="relative hover:bg-gray-100">
              <Bell className="h-5 w-5" />
              {(alertsData?.count ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {alertsData!.count}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
