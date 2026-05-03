import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, CheckCircle, CreditCard, ShoppingCart, Package, Activity,
  Clock, Terminal, RefreshCw, Zap,
} from "lucide-react";
import { format } from "date-fns";
import type { ActivityEvent, ErrorEntry, WholesalerRow } from "./types";

const PAGE_SIZE = 25;

export function SupportLogsSection({ isAdmin, wholesalers }: { isAdmin: boolean; wholesalers: WholesalerRow[] }) {
  const [tab, setTab] = useState<"activity" | "errors">("activity");
  const [wholesalerFilter, setWholesalerFilter] = useState<string>("");
  const [activityLimit, setActivityLimit] = useState(PAGE_SIZE);
  const [errorsLimit, setErrorsLimit] = useState(PAGE_SIZE);

  const activityUrl = `/api/admin/activity?limit=${activityLimit}${wholesalerFilter ? `&wholesalerId=${wholesalerFilter}` : ""}`;
  const errorsUrl = `/api/admin/errors?limit=${errorsLimit}`;

  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useQuery<{ events: ActivityEvent[]; total: number }>({
    queryKey: ["/api/admin/activity", activityLimit, wholesalerFilter],
    queryFn: async () => {
      const r = await fetch(activityUrl, { credentials: "include" });
      return r.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const { data: errorsData, isLoading: errorsLoading, refetch: refetchErrors } = useQuery<{ errors: ErrorEntry[]; total: number }>({
    queryKey: ["/api/admin/errors", errorsLimit],
    queryFn: async () => {
      const r = await fetch(errorsUrl, { credentials: "include" });
      return r.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const severityBadge = (s: string) => {
    if (s === "critical") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Critical</span>;
    if (s === "error") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Error</span>;
    if (s === "warning") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Warning</span>;
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Info</span>;
  };

  const typeIcon = (type: string) => {
    if (type === "payment_failure") return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    if (type === "subscription_event") return <CreditCard className="h-3.5 w-3.5 text-blue-400" />;
    if (type === "order") return <ShoppingCart className="h-3.5 w-3.5 text-amber-400" />;
    if (type === "stock_movement") return <Package className="h-3.5 w-3.5 text-green-500" />;
    return <Zap className="h-3.5 w-3.5 text-indigo-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Support & Logs</h2>
          <p className="text-xs text-gray-400">Platform activity feed and error log</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs border-gray-200 gap-1.5" onClick={() => tab === "activity" ? refetchActivity() : refetchErrors()}>
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab("activity")} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${tab === "activity" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Activity Feed</span>
        </button>
        <button onClick={() => setTab("errors")} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${tab === "errors" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <span className="flex items-center gap-1.5"><Terminal className="h-3.5 w-3.5" />Error Log</span>
        </button>
      </div>

      {tab === "activity" && (
        <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-semibold text-gray-700">
                Platform Activity
                <span className="ml-2 text-xs font-normal text-gray-400">{activityData?.total ?? 0} total</span>
              </CardTitle>
              <select
                value={wholesalerFilter}
                onChange={e => { setWholesalerFilter(e.target.value); setActivityLimit(PAGE_SIZE); }}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
              >
                <option value="">All wholesalers</option>
                {wholesalers.map(w => (
                  <option key={w.id} value={w.id}>{w.businessName || `${w.firstName || ""} ${w.lastName || ""}`.trim() || w.email}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {activityLoading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading activity...</div>
            ) : !activityData?.events?.length ? (
              <div className="p-8 text-center">
                <Activity className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No activity recorded yet</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {activityData.events.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50">
                      <div className="w-7 h-7 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        {typeIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800">{item.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.wholesalerName} · {item.actorName}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {format(new Date(item.timestamp), "dd MMM, HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
                {activityData.events.length < activityData.total && (
                  <div className="px-4 py-3 border-t border-gray-50 flex justify-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-gray-500 h-7"
                      onClick={() => setActivityLimit(prev => prev + PAGE_SIZE)}
                    >
                      Load more ({activityData.total - activityData.events.length} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "errors" && (
        <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">
              Error Log
              <span className="ml-2 text-xs font-normal text-gray-400">{errorsData?.total ?? 0} total</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {errorsLoading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading errors...</div>
            ) : !errorsData?.errors?.length ? (
              <div className="p-8 text-center">
                <CheckCircle className="h-8 w-8 text-green-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No errors recorded — all clear</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {errorsData.errors.map(item => (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50">
                      <div className="w-7 h-7 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-medium text-gray-800 truncate">{item.errorType.replace(/_/g, " ")}</p>
                          {severityBadge(item.severity)}
                          <span className="text-xs text-gray-300">{item.source}</span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">{item.message}</p>
                        {item.wholesalerName && <p className="text-xs text-gray-400 mt-0.5">{item.wholesalerName}</p>}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {format(new Date(item.timestamp), "dd MMM, HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
                {errorsData.errors.length < errorsData.total && (
                  <div className="px-4 py-3 border-t border-gray-50 flex justify-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-gray-500 h-7"
                      onClick={() => setErrorsLimit(prev => prev + PAGE_SIZE)}
                    >
                      Load more ({errorsData.total - errorsData.errors.length} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
