import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, Phone, Mail, Building2, Package, MessageSquare,
  Clock, CheckCircle2, Eye, X, TrendingUp, Users, Star,
} from "lucide-react";

interface StoreEnquiry {
  id: number;
  wholesalerId: string;
  enquirerName: string | null;
  enquirerEmail: string | null;
  enquirerPhone: string | null;
  enquirerBusiness: string | null;
  businessType: string | null;
  estimatedOrderVolume: string | null;
  preferredContact: string | null;
  message: string | null;
  productId: number | null;
  productName: string | null;
  quantity: number | null;
  status: string;
  createdAt: string;
}

function statusBadge(status: string) {
  if (status === 'new') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">New</Badge>;
  if (status === 'viewed') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">Viewed</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 text-[10px]">Responded</Badge>;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function EnquiryDrawer({ enquiry, onClose }: { enquiry: StoreEnquiry; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const markMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest('PATCH', `/api/public/enquiries/${enquiry.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries'] });
      toast({ title: "Updated", description: "Lead status updated." });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-semibold text-gray-900">{enquiry.enquirerName || 'Unknown'}</p>
            <p className="text-xs text-gray-500">{enquiry.enquirerBusiness || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Status */}
          <div className="flex items-center gap-2">
            {statusBadge(enquiry.status)}
            <span className="text-xs text-gray-400">{timeAgo(enquiry.createdAt)}</span>
          </div>

          {/* Contact */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</p>
            {enquiry.enquirerPhone && (
              <a href={`tel:${enquiry.enquirerPhone}`} className="flex items-center gap-2 text-sm text-gray-800 hover:text-primary">
                <Phone className="h-3.5 w-3.5 text-gray-400" /> {enquiry.enquirerPhone}
              </a>
            )}
            {enquiry.enquirerEmail && (
              <a href={`mailto:${enquiry.enquirerEmail}`} className="flex items-center gap-2 text-sm text-gray-800 hover:text-primary">
                <Mail className="h-3.5 w-3.5 text-gray-400" /> {enquiry.enquirerEmail}
              </a>
            )}
            {enquiry.preferredContact && (
              <p className="text-xs text-gray-500">Prefers contact via <span className="font-medium text-gray-700 capitalize">{enquiry.preferredContact}</span></p>
            )}
          </div>

          {/* Business */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Business</p>
            {enquiry.businessType && (
              <div className="flex items-center gap-2 text-sm text-gray-800">
                <Building2 className="h-3.5 w-3.5 text-gray-400" /> {enquiry.businessType}
              </div>
            )}
            {enquiry.estimatedOrderVolume && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-gray-800">Est. order: </span>
                <span className="font-semibold text-emerald-700">{enquiry.estimatedOrderVolume}</span>
              </div>
            )}
          </div>

          {/* Product interest */}
          {(enquiry.productName || enquiry.quantity) && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product Interest</p>
              {enquiry.productName && (
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <Package className="h-3.5 w-3.5 text-gray-400" /> {enquiry.productName}
                </div>
              )}
              {enquiry.quantity && (
                <p className="text-xs text-gray-500">Quantity: <span className="font-medium text-gray-700">{enquiry.quantity}</span></p>
              )}
            </div>
          )}

          {/* Message */}
          {enquiry.message && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Message</p>
              <p className="text-sm text-gray-800 leading-relaxed">{enquiry.message}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t space-y-2">
          {enquiry.enquirerPhone && (
            <a
              href={`https://wa.me/${enquiry.enquirerPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <MessageSquare className="h-4 w-4" /> Reply on WhatsApp
            </a>
          )}
          {enquiry.status !== 'responded' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => markMutation.mutate('responded')}
              disabled={markMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" />
              {markMutation.isPending ? 'Saving…' : 'Mark as Responded'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const [filter, setFilter] = useState<'all' | 'new' | 'viewed' | 'responded'>('all');
  const [selected, setSelected] = useState<StoreEnquiry | null>(null);
  const queryClient = useQueryClient();

  const { data: rawEnquiries, isLoading } = useQuery<StoreEnquiry[]>({
    queryKey: ['/api/public/enquiries'],
  });
  const enquiries = rawEnquiries ?? [];

  const markViewedMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/public/enquiries/${id}`, { status: 'viewed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries'] }),
  });

  const handleOpen = (e: StoreEnquiry) => {
    setSelected(e);
    if (e.status === 'new') markViewedMutation.mutate(e.id);
  };

  const newCount = enquiries.filter(e => e.status === 'new').length;
  const filtered = filter === 'all' ? enquiries : enquiries.filter(e => e.status === filter);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <PageHeader title="Leads" description="Enquiries from your public store">
        {newCount > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <Star className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">{newCount} new</span>
          </div>
        )}
      </PageHeader>
      <div className="px-4 sm:px-6 py-5 max-w-3xl mx-auto">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: enquiries.length, icon: Users, color: 'text-gray-600' },
          { label: 'New', value: enquiries.filter(e => e.status === 'new').length, icon: Inbox, color: 'text-emerald-600' },
          { label: 'Responded', value: enquiries.filter(e => e.status === 'responded').length, icon: CheckCircle2, color: 'text-blue-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <Icon className={`h-4 w-4 mx-auto mb-1 ${color}`} />
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'new', 'viewed', 'responded'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/40'
            }`}
          >
            {f}
            {f === 'new' && newCount > 0 && (
              <span className="ml-1 bg-emerald-500 text-white text-[9px] rounded-full px-1.5 py-0.5">{newCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Inbox className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">No leads yet</p>
          <p className="text-xs text-gray-400 mt-1">Enable your public store in Settings to start receiving enquiries</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <button
              key={e.id}
              onClick={() => handleOpen(e)}
              className={`w-full text-left bg-white border rounded-xl p-4 hover:shadow-md transition-all group ${
                e.status === 'new' ? 'border-emerald-200 shadow-sm' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                  e.status === 'new' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {(e.enquirerName || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900">{e.enquirerName || 'Unknown'}</p>
                    {statusBadge(e.status)}
                    {e.estimatedOrderVolume && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                        {e.estimatedOrderVolume}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {e.enquirerBusiness || '—'} {e.businessType ? `· ${e.businessType}` : ''}
                  </p>
                  {e.productName && (
                    <p className="text-xs text-primary mt-1 truncate">
                      <Package className="h-3 w-3 inline mr-1" />{e.productName}
                    </p>
                  )}
                  {e.message && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{e.message}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />{timeAgo(e.createdAt)}
                  </p>
                  {e.enquirerPhone && (
                    <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                      <Phone className="h-3 w-3" />{e.preferredContact === 'whatsapp' ? 'WA' : 'Call'}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <EnquiryDrawer enquiry={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
