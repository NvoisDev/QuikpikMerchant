import { useEffect } from "react";
import { useLocation } from "wouter";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, MessageSquare, Package, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";

export default function Campaigns() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { checkTabAccess, permissionsLoading } = useSidebarPermissions();

  useEffect(() => {
    if (permissionsLoading) return;
    if (user?.role === 'team_member' && !checkTabAccess('campaigns')) {
      toast({
        title: "Access restricted",
        description: "You don't have permission to view the Campaigns page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, permissionsLoading, checkTabAccess, toast, setLocation]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <PageHeader title="Broadcast" description="Broadcast messaging is coming soon" />
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50 shadow-sm">
          <CardContent className="p-8 sm:p-12 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <MessageSquare className="h-8 w-8 text-emerald-700" />
            </div>
            <Badge className="mb-4 border-emerald-200 bg-white text-emerald-700 hover:bg-white">
              Coming soon
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              Broadcast is coming soon
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Broadcast messaging is not available right now. Your existing records are being kept safely, but creating, editing, and sending broadcasts has been paused.
            </p>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <Clock className="h-5 w-5 text-emerald-600 mb-3" />
                <p className="font-semibold text-slate-900">Paused for now</p>
                <p className="text-sm text-slate-500 mt-1">No new broadcasts can be sent from this area.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <Package className="h-5 w-5 text-emerald-600 mb-3" />
                <p className="font-semibold text-slate-900">Products unchanged</p>
                <p className="text-sm text-slate-500 mt-1">Your product and order tools are unaffected.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <Users className="h-5 w-5 text-emerald-600 mb-3" />
                <p className="font-semibold text-slate-900">Customers unchanged</p>
                <p className="text-sm text-slate-500 mt-1">Your customer groups and directory stay available.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
