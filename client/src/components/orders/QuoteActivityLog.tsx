import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Plus, Minus, RefreshCw, Tag, Calculator, Truck, CreditCard, AlertCircle, RotateCcw, X, Banknote, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface ActivityLog {
  id: number;
  quoteId: number;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  description: string;
  performedBy: string | null;
  createdAt: string;
}

interface QuoteActivityLogProps {
  orderId: number;
}

function getActionIcon(actionType: string) {
  switch (actionType) {
    case 'quote_created': return <FileText className="h-3.5 w-3.5" />;
    case 'product_added': return <Plus className="h-3.5 w-3.5" />;
    case 'product_removed': return <Minus className="h-3.5 w-3.5" />;
    case 'quantity_changed': return <RefreshCw className="h-3.5 w-3.5" />;
    case 'price_changed': return <Tag className="h-3.5 w-3.5" />;
    case 'total_updated': return <Calculator className="h-3.5 w-3.5" />;
    case 'delivery_cost_changed': return <Truck className="h-3.5 w-3.5" />;
    case 'payment_initiated':
    case 'payment_successful': return <CreditCard className="h-3.5 w-3.5" />;
    case 'payment_failed': return <AlertCircle className="h-3.5 w-3.5" />;
    case 'stock_restored': return <RotateCcw className="h-3.5 w-3.5" />;
    case 'quote_cancelled': return <X className="h-3.5 w-3.5" />;
    case 'offline_payment_recorded': return <Banknote className="h-3.5 w-3.5" />;
    default: return <Clock className="h-3.5 w-3.5" />;
  }
}

function getActionColors(actionType: string): { bg: string; icon: string; dot: string } {
  switch (actionType) {
    case 'quote_created':
      return { bg: 'bg-blue-50', icon: 'text-blue-600', dot: 'bg-blue-400' };
    case 'product_added':
    case 'payment_successful':
    case 'payment_initiated':
    case 'offline_payment_recorded':
      return { bg: 'bg-green-50', icon: 'text-green-600', dot: 'bg-green-400' };
    case 'product_removed':
    case 'payment_failed':
    case 'quote_cancelled':
      return { bg: 'bg-red-50', icon: 'text-red-600', dot: 'bg-red-400' };
    case 'quantity_changed':
    case 'price_changed':
      return { bg: 'bg-amber-50', icon: 'text-amber-600', dot: 'bg-amber-400' };
    default:
      return { bg: 'bg-gray-50', icon: 'text-gray-500', dot: 'bg-gray-300' };
  }
}

function formatActor(performedBy: string | null, userId: string | undefined): string {
  if (!performedBy || performedBy === 'system') return 'System';
  if (userId && performedBy === userId) return 'You';
  return performedBy.substring(0, 8) + '…';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export function QuoteActivityLog({ orderId }: QuoteActivityLogProps) {
  const [expanded, setExpanded] = useState(false);
  const { user } = useAuth();

  const { data, isLoading } = useQuery<{ logs: ActivityLog[]; page: number; hasMore: boolean }>({
    queryKey: ['/api/quotes', orderId, 'activity'],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/${orderId}/activity`);
      if (!res.ok) throw new Error('Failed to load activity');
      return res.json();
    },
    enabled: expanded,
    staleTime: 30_000,
  });

  const logs = data?.logs ?? [];

  // Group logs by date for visual separators
  const grouped: { date: string; entries: ActivityLog[] }[] = [];
  for (const log of logs) {
    const dateLabel = formatDate(log.createdAt);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== dateLabel) {
      grouped.push({ date: dateLabel, entries: [log] });
    } else {
      last.entries.push(log);
    }
  }

  return (
    <div className="mt-4 border-t pt-4">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 w-full text-left"
      >
        <Clock className="h-4 w-4 text-gray-400" />
        <span>Activity log</span>
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-3">
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading activity…
            </div>
          )}

          {!isLoading && logs.length === 0 && (
            <p className="text-sm text-gray-400 py-3">No activity recorded yet.</p>
          )}

          {!isLoading && logs.length > 0 && (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[18px] top-0 bottom-0 w-px bg-gray-100" aria-hidden />

              <div className="space-y-1">
                {grouped.map(group => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-2 py-2 pl-10">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                        {group.date}
                      </span>
                    </div>

                    {group.entries.map(log => {
                      const colors = getActionColors(log.actionType);
                      return (
                        <div key={log.id} className="flex items-start gap-3 py-2">
                          {/* Icon bubble */}
                          <div className={`flex-shrink-0 w-9 h-9 rounded-full ${colors.bg} flex items-center justify-center z-10 ring-2 ring-white`}>
                            <span className={colors.icon}>
                              {getActionIcon(log.actionType)}
                            </span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                {formatActor(log.performedBy, user?.id)}
                              </span>
                              <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
                                {formatTime(log.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-0.5 leading-snug break-words">
                              {log.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {data?.hasMore && (
                <div className="pl-12 pt-2">
                  <Button variant="ghost" size="sm" className="text-xs text-gray-500">
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
