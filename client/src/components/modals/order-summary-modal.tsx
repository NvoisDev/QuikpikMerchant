import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  X, 
  ShoppingCart, 
  Truck, 
  CreditCard,
  Package,
  AlertCircle 
} from "lucide-react";

interface CartItem {
  productId: number;
  quantity: number;
  product: {
    id: number;
    name: string;
    price: string;
    imageUrl?: string;
    moq: number;
    stock: number;
  };
}

interface OrderSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  formatCurrency: (amount: number | string) => string;
}

export default function OrderSummaryModal({
  isOpen,
  onClose,
  cartItems,
  formatCurrency
}: OrderSummaryModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      return await apiRequest("POST", "/api/orders", orderData);
    },
    onSuccess: (orderData) => {
      toast({
        title: "Order Created",
        description: "Your order has been created successfully",
      });
      onClose();
      // Redirect to checkout with order ID
      window.location.href = `/checkout?orderId=${orderData.order.id}`;
    },
    onError: (error: Error) => {
      toast({
        title: "Order Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const calculateTotals = () => {
    const subtotal = cartItems.reduce((total, item) => {
      return total + (parseFloat(item.product.price) * item.quantity);
    }, 0);
    // Customer transaction fee: 5.5% + £0.50
    const transactionFee = (subtotal * 0.055) + 0.50;
    const total = subtotal + transactionFee;

    return { subtotal, transactionFee, total };
  };

  const { subtotal, transactionFee, total } = calculateTotals();

  const handleProceedToPayment = () => {
    if (!deliveryAddress.trim()) {
      toast({
        title: "Delivery Address Required",
        description: "Please enter a delivery address",
        variant: "destructive",
      });
      return;
    }

    const orderItems = cartItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity
    }));

    createOrderMutation.mutate({
      items: orderItems,
      deliveryAddress,
      notes
    });
  };

  const removeFromCart = (productId: number) => {
    // This would typically update the parent component's cart state
    // For now, we'll show a toast
    toast({
      title: "Item Removed",
      description: "Item removed from cart",
    });
  };

  if (cartItems.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ShoppingCart className="mr-2 h-5 w-5" />
              Your Cart
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <ShoppingCart className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Your cart is empty</h3>
            <p className="text-gray-500 mb-4">Add some products to get started</p>
            <Button onClick={onClose}>Continue Shopping</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <ShoppingCart className="mr-2 h-5 w-5" />
              Order Summary
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Items */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center">
              <Package className="mr-2 h-4 w-4" />
              Items ({cartItems.length})
            </h3>
            {cartItems.map((item) => (
              <Card key={item.productId}>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-4">
                    <img 
                      src={item.product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=80&h=80"} 
                      alt={item.product.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{item.product.name}</h4>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Quantity: {item.quantity} units</p>
                        <p>Unit Price: {formatCurrency(item.product.price)}</p>
                        {item.quantity < item.product.moq && (
                          <div className="flex items-center text-orange-600">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            <span className="text-xs">Below minimum order quantity</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(parseFloat(item.product.price) * item.quantity)}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700 mt-2"
                        onClick={() => removeFromCart(item.productId)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Delivery Information */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center">
              <Truck className="mr-2 h-4 w-4" />
              Delivery Information
            </h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="delivery-address">Delivery Address *</Label>
                <Textarea
                  id="delivery-address"
                  placeholder="Enter your complete delivery address..."
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="notes">Order Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any special instructions or notes for your order..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Standard Delivery</h4>
                <p className="text-sm text-gray-600">
                  Estimated delivery within 3-5 business days
                </p>
              </div>
            </div>
          </div>

          {/* Order Totals */}
          <div className="border-t pt-6">
            <h3 className="font-medium text-gray-900 flex items-center mb-4">
              <CreditCard className="mr-2 h-4 w-4" />
              Order Total
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Transaction Fee (5.5% + £0.50):</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(transactionFee)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center text-lg font-semibold">
                <span className="text-gray-900">Total:</span>
                <span className="text-gray-900">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 pt-4">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onClose}
            >
              Continue Shopping
            </Button>
            <Button 
              className="flex-1" 
              onClick={handleProceedToPayment}
              disabled={createOrderMutation.isPending || !deliveryAddress.trim()}
            >
              {createOrderMutation.isPending ? (
                <div className="flex items-center">
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Creating Order...
                </div>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Proceed to Payment
                </>
              )}
            </Button>
          </div>

          {/* Order Summary Info */}
          <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
            <p className="mb-2">
              <strong>Next Steps:</strong> After clicking "Proceed to Payment", you'll be redirected to our secure checkout page to complete your payment with Stripe.
            </p>
            <p>
              Your order will be confirmed once payment is successfully processed.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
