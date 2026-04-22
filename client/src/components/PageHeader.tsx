import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Share2, Bell, AlertTriangle, Users, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface NotificationCounts {
  total: number;
  stockAlerts: number;
  registrationRequests: number;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: counts } = useQuery<NotificationCounts>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 60000,
  });

  const total = counts?.total ?? 0;
  const stockAlerts = counts?.stockAlerts ?? 0;
  const registrationRequests = counts?.registrationRequests ?? 0;

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
    <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 hidden lg:block">
          <h1 className="page-header truncate">{title}</h1>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {children}
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-slate-100 text-slate-500 hover:text-slate-700"
            onClick={handleShareStore}
          >
            <Share2 className="h-[18px] w-[18px]" />
          </Button>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative hover:bg-slate-100 text-slate-500 hover:text-slate-700">
                <Bell className="h-[18px] w-[18px]" />
                {total > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-semibold">
                    {total > 99 ? "99+" : total}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 shadow-lg border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-slate-900">Notifications</h3>
                {total > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5">{total} item{total !== 1 ? "s" : ""} need your attention</p>
                )}
              </div>

              {total === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-700">You're all caught up!</p>
                  <p className="text-xs text-slate-400 mt-1">No pending items right now</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {registrationRequests > 0 && (
                    <div
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setOpen(false);
                        navigate("/customer-registration-requests");
                      }}
                    >
                      <div className="flex-shrink-0 w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Users className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {registrationRequests} customer{registrationRequests !== 1 ? "s" : ""} waiting for approval
                        </p>
                        <p className="text-xs text-slate-500">Review and approve or decline requests</p>
                      </div>
                      <span className="flex-shrink-0 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full px-2 py-0.5">
                        {registrationRequests}
                      </span>
                    </div>
                  )}

                  {stockAlerts > 0 && (
                    <div
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setOpen(false);
                        navigate("/stock-alerts");
                      }}
                    >
                      <div className="flex-shrink-0 w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {stockAlerts} product{stockAlerts !== 1 ? "s" : ""} low on stock
                        </p>
                        <p className="text-xs text-slate-500">Review stock levels and restock as needed</p>
                      </div>
                      <span className="flex-shrink-0 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full px-2 py-0.5">
                        {stockAlerts}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-slate-100 px-4 py-2">
                <p className="text-xs text-slate-400">Checks every 60 seconds · Stock alerts sent daily at 8 AM</p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
