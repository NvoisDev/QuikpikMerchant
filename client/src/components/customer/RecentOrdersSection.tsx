import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ShoppingCart, Truck, MapPin, FileText } from "lucide-react";
import {
  Order,
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  getPaymentStatusColor,
  getPaymentStatusLabel,
  OrderDetailsModal,
  OrderActionsDropdown,
  PayBalanceButton,
} from "@/components/customer/CustomerOrderHistory";
import { formatCurrency } from "@shared/utils/currency";
import { queryClient } from "@/lib/queryClient";

interface RecentOrdersSectionProps {
  wholesalerId: string;
  customerPhone: string;
  onViewAllOrders: () => void;
  defaultCurrency?: string;
}

export function RecentOrdersSection({ wholesalerId, customerPhone, onViewAllOrders, defaultCurrency }: RecentOrdersSectionProps) {
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<number | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);

  const downloadInvoice = async (order: Order) => {
    setDownloadingInvoiceId(order.id);
    try {
      const encodedPhone = encodeURIComponent(customerPhone);
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}/${order.id}/invoice`);
      if (!response.ok) throw new Error('Failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${order.orderNumber || order.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Could not generate the invoice. Please try again.');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const { data: recentOrders = [] } = useQuery({
    queryKey: [`/api/customer-orders`, wholesalerId, customerPhone, 'recent'],
    queryFn: async () => {
      const encodedPhone = encodeURIComponent(customerPhone);
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}?limit=3`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!wholesalerId && !!customerPhone,
  });

  if (recentOrders.length === 0) return null;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/customer-orders`, wholesalerId, customerPhone, 'recent'] });
  };

  return (
    <div className="bg-white rounded-lg p-6 border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Recent Orders</h2>
        <Button
          variant="outline"
          onClick={onViewAllOrders}
          className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
        >
          View All Orders
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recentOrders.map((order: Order) => (
          <div key={order.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-sm pt-0.5">{order.orderNumber}</span>
              <div className="flex flex-col items-end gap-1">
                {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                  <PayBalanceButton order={order} customerPhone={customerPhone} />
                )}
                <span className="text-xs text-gray-400">
                  {order.createdAt ? format(new Date(order.createdAt), 'dd/MM/yyyy') : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`${getStatusColor(order.status)} text-xs`}>
                {getStatusIcon(order.status)}
                <span className="ml-1">{getStatusLabel(order.status || '')}</span>
              </Badge>
              {order.paymentStatus && order.status !== 'cancelled' && (
                <Badge className={`${getPaymentStatusColor(order.paymentStatus)} text-xs`}>
                  {getPaymentStatusLabel(order.paymentStatus)}
                </Badge>
              )}
              <Badge variant="outline" className={`text-xs ${order.isQuote ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                {order.isQuote ? <><FileText className="h-3 w-3 mr-1" /> Quote</> : <><ShoppingCart className="h-3 w-3 mr-1" /> Online</>}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-600">
              {order.fulfillmentType === 'delivery' ? (
                <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Delivery</span>
              ) : (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Collection</span>
              )}
              <span className="font-medium text-gray-900">{formatCurrency(parseFloat(order.total || order.subtotal), defaultCurrency || 'GBP')}</span>
              {order.items && order.items.length > 0 && (
                <span>{order.items.length} item{order.items.length > 1 ? 's' : ''}</span>
              )}
            </div>

            <div className="flex justify-end pt-1.5 border-t border-gray-100">
              <OrderActionsDropdown
                order={order}
                onViewDetails={() => setSelectedOrderForDetails(order)}
                customerPhone={customerPhone}
                onSuccess={handleRefresh}
                currency={defaultCurrency || 'GBP'}
                downloadingInvoiceId={downloadingInvoiceId}
                onDownloadInvoice={() => downloadInvoice(order)}
              />
            </div>
          </div>
        ))}
      </div>

      {selectedOrderForDetails && (
        <Dialog open={!!selectedOrderForDetails} onOpenChange={(o) => { if (!o) setSelectedOrderForDetails(null); }}>
          <OrderDetailsModal
            order={selectedOrderForDetails}
            wholesalerId={wholesalerId}
            customerPhone={customerPhone}
          />
        </Dialog>
      )}
    </div>
  );
}
