import { useState } from "react";
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, Phone, Mail, Building2, Package, MessageSquare,
  Clock, CheckCircle2, Eye, X, TrendingUp, Users, Star,
  Settings, ShoppingCart, FileText, Save, ExternalLink, Send,
} from "lucide-react";

interface CartItem {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: string;
  total: string;
  sellingType: string;
}

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
  orderId: number | null;
  cartItems: CartItem[] | null;
  wholesalerNote: string | null;
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
  const [note, setNote] = useState(enquiry.wholesalerNote ?? '');
  const [noteDirty, setNoteDirty] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const isQuoteRequest = !!enquiry.orderId;

  const { data: linkedOrder, isLoading: orderLoading } = useQuery<{ status: string }>({
    queryKey: [`/api/orders/${enquiry.orderId}`],
    enabled: isQuoteRequest,
    staleTime: 0,
  });
  const orderIsDraft = isQuoteRequest && linkedOrder?.status === 'draft';

  const markMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest('PATCH', `/api/public/enquiries/${enquiry.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries/new-count'] });
      toast({ title: "Updated", description: "Lead status updated." });
      onClose();
    },
  });

  const noteMutation = useMutation({
    mutationFn: (wholesalerNote: string) =>
      apiRequest('PATCH', `/api/public/enquiries/${enquiry.id}`, { wholesalerNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries'] });
      setNoteDirty(false);
      toast({ title: "Note saved", description: "Your note has been saved." });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/orders/${enquiry.orderId}/approve`);
      await apiRequest('PATCH', `/api/public/enquiries/${enquiry.id}`, { status: 'responded' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries/new-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: "Invoice sent!", description: "The draft has been approved and the invoice emailed to the customer." });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Approval failed", description: err?.message || "Could not approve the draft.", variant: "destructive" });
    },
  });

  const cartTotal = enquiry.cartItems?.reduce((s, i) => s + parseFloat(i.total || '0'), 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">{enquiry.enquirerName || 'Unknown'}</p>
              {isQuoteRequest && (
                <span className="text-[10px] bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                  <ShoppingCart className="h-2.5 w-2.5" /> Quote Request
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">{enquiry.enquirerBusiness || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Status + time */}
          <div className="flex items-center gap-2">
            {statusBadge(enquiry.status)}
            <span className="text-xs text-gray-400">{timeAgo(enquiry.createdAt)}</span>
          </div>

          {/* Draft invoice link for quote requests */}
          {isQuoteRequest && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> Draft Invoice
              </p>
              <p className="text-xs text-violet-600 mb-3">A draft invoice has been created from this cart quote request. Approve it now to send the invoice to the customer instantly, or open it first to make changes.</p>
              {linkedOrder && linkedOrder.status !== 'draft' ? (
                <div className="flex items-center justify-center gap-2 w-full py-2 mb-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Invoice already sent
                </div>
              ) : (
                <Button
                  className="w-full mb-2 bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => setShowApproveConfirm(true)}
                  disabled={approveMutation.isPending || orderLoading || !orderIsDraft}
                >
                  <Send className="h-3.5 w-3.5 mr-2" />
                  {approveMutation.isPending ? 'Approving…' : 'Approve & Send Invoice'}
                </Button>
              )}
              <a
                href={`/invoices?draft=${enquiry.orderId}`}
                className="flex items-center justify-center gap-2 w-full py-2 border border-violet-300 text-violet-700 hover:bg-violet-100 rounded-lg text-sm font-medium transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View & Edit Draft Invoice
              </a>
            </div>
          )}

          {/* Cart items for quote requests */}
          {isQuoteRequest && enquiry.cartItems && enquiry.cartItems.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <ShoppingCart className="h-3 w-3" /> Requested Items ({enquiry.cartItems.length})
              </p>
              <div className="space-y-2">
                {enquiry.cartItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                      <p className="text-[11px] text-gray-400 capitalize">{item.sellingType} · {item.quantity} × £{parseFloat(item.unitPrice).toFixed(2)}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 ml-3">£{parseFloat(item.total).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                <span className="text-xs font-semibold text-gray-600">Subtotal</span>
                <span className="text-sm font-bold text-gray-900">£{cartTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

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
          {(enquiry.businessType || enquiry.estimatedOrderVolume) && (
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
          )}

          {/* Product interest (single-product enquiries only) */}
          {!isQuoteRequest && (enquiry.productName || enquiry.quantity) && (
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

          {/* Internal note */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Internal Note</p>
            <Textarea
              placeholder="Add a private note about this lead…"
              value={note}
              onChange={(e) => { setNote(e.target.value); setNoteDirty(true); }}
              className="text-sm min-h-[80px] bg-white border-amber-200 focus:border-amber-400 resize-none"
            />
            {noteDirty && (
              <Button
                size="sm"
                variant="outline"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={() => noteMutation.mutate(note)}
                disabled={noteMutation.isPending}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {noteMutation.isPending ? 'Saving…' : 'Save Note'}
              </Button>
            )}
          </div>
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
          {enquiry.enquirerEmail && !enquiry.enquirerPhone && (
            <a
              href={`mailto:${enquiry.enquirerEmail}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Mail className="h-4 w-4" /> Reply by Email
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

      <AlertDialog open={showApproveConfirm} onOpenChange={setShowApproveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send invoice to {enquiry.enquirerName || 'customer'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve the draft and email the invoice to{' '}
              <strong>{enquiry.enquirerName || 'the customer'}</strong>
              {enquiry.enquirerBusiness ? ` (${enquiry.enquirerBusiness})` : ''} for{' '}
              <strong>£{cartTotal.toFixed(2)}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              {approveMutation.isPending ? 'Sending…' : 'Send Invoice'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type LeadsView = 'leads' | 'quote-requests';

export default function LeadsPage() {
  const [view, setView] = useState<LeadsView>('leads');
  const [filter, setFilter] = useState<'all' | 'new' | 'viewed' | 'responded'>('all');
  const [selected, setSelected] = useState<StoreEnquiry | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useQuery<{ storeVisibility?: string }>({
    queryKey: ['/api/auth/user'],
  });

  const isPublic = user?.storeVisibility === 'public';

  const visibilityMutation = useMutation({
    mutationFn: (pub: boolean) =>
      apiRequest('PUT', '/api/user/profile', { storeVisibility: pub ? 'public' : 'private' }),
    onSuccess: (_, pub) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: pub ? 'Store is now public 🌐' : 'Store set to private',
        description: pub
          ? 'Customers can now find and enquire about your products.'
          : 'Only invited customers can access your store.',
      });
    },
  });

  const { data: rawEnquiries, isLoading } = useQuery<StoreEnquiry[]>({
    queryKey: ['/api/public/enquiries'],
  });
  const enquiries = rawEnquiries ?? [];

  const markViewedMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/public/enquiries/${id}`, { status: 'viewed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/public/enquiries/new-count'] });
    },
  });

  const handleOpen = (e: StoreEnquiry) => {
    setSelected(e);
    if (e.status === 'new') markViewedMutation.mutate(e.id);
  };

  // Split enquiries into regular leads vs cart quote requests
  const regularLeads = enquiries.filter(e => !e.orderId);
  const quoteRequests = enquiries.filter(e => !!e.orderId);

  const activeList = view === 'leads' ? regularLeads : quoteRequests;
  const filtered = filter === 'all' ? activeList : activeList.filter(e => e.status === filter);

  const newLeadsCount = regularLeads.filter(e => e.status === 'new').length;
  const newQuoteCount = quoteRequests.filter(e => e.status === 'new').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <PageHeader title="Leads" description="Enquiries from your public store">
        {(newLeadsCount > 0 || newQuoteCount > 0) && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <Star className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">
              {newLeadsCount + newQuoteCount} new
            </span>
          </div>
        )}
      </PageHeader>
      <div className="px-4 sm:px-6 py-5 max-w-3xl mx-auto">

        {/* Public store toggle */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 text-sm">Make store public</p>
              <p className="text-xs text-gray-500 mt-0.5">Your products become searchable on quikpik.app</p>
            </div>
            <Switch
              checked={isPublic}
              disabled={visibilityMutation.isPending}
              onCheckedChange={(v) => visibilityMutation.mutate(v)}
              className="data-[state=checked]:bg-green-600"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
            <Settings className="h-3 w-3 shrink-0" />
            <span>Go to{' '}
              <Link href="/settings?tab=store" className="text-green-600 underline underline-offset-2">
                Settings → Store Setup
              </Link>{' '}
              to customise your store details.
            </span>
          </p>
        </div>

        {/* View tabs: Leads vs Quote Requests */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => { setView('leads'); setFilter('all'); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
              view === 'leads'
                ? 'bg-primary text-white border-primary'
                : 'bg-white border-gray-200 text-gray-600 hover:border-primary/40'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Leads
            {newLeadsCount > 0 && (
              <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-bold ${view === 'leads' ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'}`}>
                {newLeadsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setView('quote-requests'); setFilter('all'); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
              view === 'quote-requests'
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white border-gray-200 text-gray-600 hover:border-violet-400'
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            Quote Requests
            {newQuoteCount > 0 && (
              <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-bold ${view === 'quote-requests' ? 'bg-white/20 text-white' : 'bg-violet-500 text-white'}`}>
                {newQuoteCount}
              </span>
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total', value: activeList.length, icon: Users, color: 'text-gray-600' },
            { label: 'New', value: activeList.filter(e => e.status === 'new').length, icon: Inbox, color: 'text-emerald-600' },
            { label: 'Responded', value: activeList.filter(e => e.status === 'responded').length, icon: CheckCircle2, color: 'text-blue-600' },
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
          {(['all', 'new', 'viewed', 'responded'] as const).map(f => {
            const newCount = activeList.filter(e => e.status === 'new').length;
            return (
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
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            {view === 'quote-requests' ? (
              <>
                <ShoppingCart className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-500">No quote requests yet</p>
                <p className="text-xs text-gray-400 mt-1">When a customer submits a cart quote from your public store, it will appear here</p>
              </>
            ) : (
              <>
                <Inbox className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-500">No leads yet</p>
                <p className="text-xs text-gray-400 mt-1">Enable your public store in Settings to start receiving enquiries</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(e => (
              <button
                key={e.id}
                onClick={() => handleOpen(e)}
                className={`w-full text-left bg-white border rounded-xl p-4 hover:shadow-md transition-all group ${
                  e.status === 'new'
                    ? view === 'quote-requests' ? 'border-violet-200 shadow-sm' : 'border-emerald-200 shadow-sm'
                    : 'border-gray-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                    e.status === 'new'
                      ? view === 'quote-requests' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
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
                    {view === 'quote-requests' && e.cartItems && e.cartItems.length > 0 && (
                      <p className="text-xs text-violet-600 mt-1 flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3" />
                        {e.cartItems.length} item{e.cartItems.length !== 1 ? 's' : ''} · £{e.cartItems.reduce((s, i) => s + parseFloat(i.total || '0'), 0).toFixed(2)}
                      </p>
                    )}
                    {view !== 'quote-requests' && e.productName && (
                      <p className="text-xs text-primary mt-1 truncate">
                        <Package className="h-3 w-3 inline mr-1" />{e.productName}
                      </p>
                    )}
                    {e.message && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{e.message}</p>
                    )}
                    {e.wholesalerNote && (
                      <p className="text-[10px] text-amber-600 mt-1 truncate italic">📝 {e.wholesalerNote}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{timeAgo(e.createdAt)}
                    </p>
                    {view === 'quote-requests' && e.orderId && (
                      <p className="text-[10px] text-violet-500 mt-1 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Draft #{e.orderId}
                      </p>
                    )}
                    {view !== 'quote-requests' && e.enquirerPhone && (
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
