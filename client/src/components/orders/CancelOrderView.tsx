import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const cancellationReasons = [
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'wrong_order', label: 'Wrong Order / Items' },
  { value: 'damaged_goods', label: 'Damaged Goods' },
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'duplicate_order', label: 'Duplicate Order' },
  { value: 'delivery_issue', label: 'Delivery Issue' },
  { value: 'other', label: 'Other' }
];

interface ReturnItem {
  productId: number;
  quantity: number;
  sellingType: string;
  maxQty: number;
}

interface OrderForCancel {
  id: number;
  orderNumber?: string;
  amountPaid?: string;
  deliveryCost?: string;
  items?: Array<{
    productId: number;
    quantity: number;
    unitPrice: string;
    product?: { name?: string };
  }>;
}

interface CancelOrderViewProps {
  order: OrderForCancel;
  returnItems: ReturnItem[];
  setReturnItems: React.Dispatch<React.SetStateAction<ReturnItem[]>>;
  cancelReasonCategory: string;
  setCancelReasonCategory: (v: string) => void;
  cancelReason: string;
  setCancelReason: (v: string) => void;
  processRefund: boolean;
  setProcessRefund: (v: boolean) => void;
  refundType: 'card';
  setRefundType: (v: 'card') => void;
  refundDelivery: boolean;
  setRefundDelivery: (v: boolean) => void;
  restockInventory: boolean;
  setRestockInventory: (v: boolean) => void;
  sendNotification: boolean;
  setSendNotification: (v: boolean) => void;
  staffNote: string;
  setStaffNote: (v: string) => void;
  isCancelling: boolean;
  formatMoney: (n: number) => string;
  onBack: () => void;
  onConfirm: () => void;
}

export function CancelOrderView({
  order,
  returnItems,
  setReturnItems,
  cancelReasonCategory,
  setCancelReasonCategory,
  cancelReason,
  setCancelReason,
  processRefund,
  setProcessRefund,
  refundType,
  setRefundType,
  refundDelivery,
  setRefundDelivery,
  restockInventory,
  setRestockInventory,
  sendNotification,
  setSendNotification,
  staffNote,
  setStaffNote,
  isCancelling,
  formatMoney,
  onBack,
  onConfirm,
}: CancelOrderViewProps) {
  const totalPaid = parseFloat(order.amountPaid || '0');
  const deliveryCostValue = parseFloat(order.deliveryCost || '0');
  const itemsRefund = returnItems.length > 0
    ? returnItems.reduce((sum, ri) => {
        const oi = order.items?.find(i => i.productId === ri.productId);
        return sum + (ri.quantity * parseFloat(oi?.unitPrice || '0'));
      }, 0)
    : totalPaid;
  const calculatedRefund = Math.min(
    itemsRefund + (returnItems.length > 0 && refundDelivery ? deliveryCostValue : 0),
    totalPaid
  );
  const isPartial = returnItems.some(ri => ri.quantity < ri.maxQty);

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Cancel Order {order.orderNumber || `#${order.id}`}</h1>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="text-sm font-medium">Reason for cancellation *</label>
            <select
              value={cancelReasonCategory}
              onChange={(e) => setCancelReasonCategory(e.target.value)}
              className="w-full mt-1 p-2 border rounded-md text-sm bg-white"
            >
              <option value="">Select a reason...</option>
              {cancellationReasons.map((reason) => (
                <option key={reason.value} value={reason.value}>{reason.label}</option>
              ))}
            </select>
            {!cancelReasonCategory && (
              <p className="text-xs text-amber-600 mt-1">Please select a reason to continue</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Additional notes (optional)</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Add any additional details..."
              className="w-full mt-1 p-2 border rounded-md text-sm min-h-[60px]"
            />
          </div>

          {order.items && order.items.length > 0 && (
            <div>
              <label className="text-sm font-medium">Items to return (adjust for partial return)</label>
              <div className="mt-2 space-y-2">
                {returnItems.map((item, index) => {
                  const orderItem = order.items?.find(oi => oi.productId === item.productId);
                  return (
                    <div key={item.productId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm truncate max-w-[140px]">
                        {orderItem?.product?.name || `Product ${item.productId}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => {
                            const newItems = [...returnItems];
                            newItems[index].quantity = Math.max(0, newItems[index].quantity - 1);
                            setReturnItems(newItems);
                          }}
                        >-</Button>
                        <span className="text-sm w-8 text-center">{item.quantity}</span>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => {
                            const newItems = [...returnItems];
                            newItems[index].quantity = Math.min(item.maxQty, newItems[index].quantity + 1);
                            setReturnItems(newItems);
                          }}
                        >+</Button>
                        <span className="text-xs text-gray-500">/ {item.maxQty}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Refund payments</h3>
            {returnItems.length > 0 && deliveryCostValue > 0 && returnItems.some(ri => ri.quantity < ri.maxQty) && (
              <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg bg-gray-50">
                <input
                  type="checkbox"
                  checked={refundDelivery}
                  onChange={(e) => setRefundDelivery(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600"
                />
                <span className="text-sm text-gray-700">
                  Include delivery charge refund ({formatMoney(deliveryCostValue)})
                </span>
              </label>
            )}
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${refundType === 'card' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
              onClick={() => { setRefundType('card'); setProcessRefund(true); }}
            >
              <input
                type="radio"
                name="refundType"
                checked={refundType === 'card'}
                onChange={() => { setRefundType('card'); setProcessRefund(true); }}
                className="w-4 h-4 text-green-600"
              />
              <div className="ml-3 flex-1">
                <span className="text-sm font-medium">Original payment method</span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-gray-500">Refund {formatMoney(calculatedRefund)} to card</p>
                  {isPartial && <span className="text-xs text-amber-600 font-medium">(partial refund)</span>}
                </div>
              </div>
            </label>
          </div>

          <div>
            <label className="text-sm font-medium">Staff note (optional)</label>
            <textarea
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
              placeholder="Internal notes — not visible to customer..."
              className="w-full mt-1 p-2 border rounded-md text-sm min-h-[50px]"
            />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={restockInventory}
                onChange={(e) => setRestockInventory(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600"
              />
              <span className="text-sm text-gray-700">Restock inventory</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600"
              />
              <span className="text-sm text-gray-700">
                Send a <span className="text-green-600">notification</span> to the customer
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-2 pt-3 border-t">
            <Button
              variant="destructive"
              className="w-full"
              onClick={onConfirm}
              disabled={isCancelling || !cancelReasonCategory}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel order'}
            </Button>
            <Button variant="ghost" className="w-full text-gray-500" onClick={onBack}>
              ← Back to order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
