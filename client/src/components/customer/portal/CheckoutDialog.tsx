import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus, Trash2, Share2, Package } from "lucide-react";
import { PriceDisplay } from "@/components/customer/PriceDisplay";
import { AddressSelector } from "@/components/customer/AddressSelector";
import { StripeCheckoutForm } from "@/components/customer/StripeCheckoutForm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CartItem } from "@/components/customer/portal-types";

interface CheckoutDialogProps {
  showCheckout: boolean;
  setShowCheckout: (v: boolean) => void;
  payLaterMode: boolean;
  setPayLaterMode: (v: boolean) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  cartStats: { subtotal: number; [key: string]: any };
  editableQuantities: Record<string, string>;
  setEditableQuantities: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  calculatePromotionalPricing: (product: any, quantity: number) => any;
  customerData: any;
  setCustomerData: React.Dispatch<React.SetStateAction<any>>;
  wholesaler: any | null;
  wholesalerId: string;
  clientSecret: string;
  setClientSecret: (v: string) => void;
  isCreatingIntent: boolean;
  authenticatedCustomer: any | null;
  createPaymentIntentForCheckout: (shippingOption: 'pickup' | 'delivery') => Promise<void>;
  createPaymentIntentWithCustomData: (data: any, option: 'pickup' | 'delivery') => Promise<void>;
  isPlacingPayLaterOrder: boolean;
  setIsPlacingPayLaterOrder: (v: boolean) => void;
  setCompletedOrder: (order: any) => void;
  refetchProducts: () => void;
  featuredProductId: number | null;
  refetchFeaturedProduct: () => void;
  lastUsedShippingOption: 'pickup' | 'delivery' | null;
  setLastUsedShippingOption: (v: 'pickup' | 'delivery' | null) => void;
  setShowThankYou: (v: boolean) => void;
}

export function CheckoutDialog({
  showCheckout,
  setShowCheckout,
  payLaterMode,
  setPayLaterMode,
  cart,
  setCart,
  cartStats,
  editableQuantities,
  setEditableQuantities,
  calculatePromotionalPricing,
  customerData,
  setCustomerData,
  wholesaler,
  wholesalerId,
  clientSecret,
  setClientSecret,
  isCreatingIntent,
  authenticatedCustomer,
  createPaymentIntentForCheckout,
  createPaymentIntentWithCustomData,
  isPlacingPayLaterOrder,
  setIsPlacingPayLaterOrder,
  setCompletedOrder,
  refetchProducts,
  featuredProductId,
  refetchFeaturedProduct,
  lastUsedShippingOption,
  setLastUsedShippingOption,
  setShowThankYou,
}: CheckoutDialogProps) {
  const { toast } = useToast();

  return (
    <Dialog open={showCheckout} onOpenChange={(open) => { setShowCheckout(open); if (!open) setPayLaterMode(false); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Complete Your Order</DialogTitle>
          <DialogDescription>
            Review your items and complete your purchase
          </DialogDescription>
        </DialogHeader>

        {cart.length > 0 && wholesaler && (
          <div className="space-y-6">
            {/* Order Summary with Fee Breakdown */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Order Summary</h3>
              <div className="space-y-3">
                {cart.map((item, index) => {
                  let itemPrice;
                  let totalCost;
                  let cartPricing: any = null;

                  if (item.sellingType === 'pallets') {
                    itemPrice = parseFloat((item.product as any).palletPrice?.toString() || '0');
                    totalCost = itemPrice * item.quantity;
                  } else {
                    cartPricing = calculatePromotionalPricing(item.product, item.quantity);
                    itemPrice = cartPricing.effectivePrice;
                    totalCost = cartPricing.totalCost;
                  }

                  const moq = item.sellingType === 'pallets' ? ((item.product as any).palletMoq || 1) : (item.product.moq || 1);
                  const availableStock = item.sellingType === 'pallets'
                    ? ((item.product as any).palletStock || 999)
                    : (item.product.stock || 999);
                  const eqKey = `${item.product.id}_${item.sellingType}`;
                  const currentEditVal = editableQuantities[eqKey] ?? String(item.quantity);

                  const commitQty = (rawVal: string) => {
                    const parsed = parseInt(rawVal, 10);
                    const clamped = isNaN(parsed) || parsed < moq ? moq : Math.min(parsed, availableStock);
                    setEditableQuantities(prev => ({ ...prev, [eqKey]: String(clamped) }));
                    setCart((prev: CartItem[]) => prev.map(c => c.product.id === item.product.id && c.sellingType === item.sellingType ? { ...c, quantity: clamped } : c));
                  };

                  const handleShare = async () => {
                    const shareText = `${item.product.name} — £${itemPrice.toFixed(2)}/${item.sellingType === 'pallets' ? 'pallet' : 'unit'}`;
                    if (navigator.share) {
                      try { await navigator.share({ title: item.product.name, text: shareText, url: window.location.href }); } catch {}
                    } else {
                      await navigator.clipboard.writeText(`${shareText} — ${window.location.href}`);
                      toast({ title: "Link copied!", description: "Product link copied to clipboard." });
                    }
                  };

                  return (
                    <div key={index} className="bg-white rounded-lg border border-gray-200 p-3">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0">
                          {(item.product.imageUrl || (item.product as any).images?.[0]) ? (
                            <img
                              src={item.product.imageUrl || (item.product as any).images?.[0]}
                              alt={item.product.name}
                              className="w-16 h-16 object-cover rounded-md border border-gray-100"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-gray-100 rounded-md flex items-center justify-center">
                              <Package className="h-7 w-7 text-gray-400" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm leading-snug">{item.product.name}</p>
                            <div className="text-right flex-shrink-0">
                              {cartPricing && cartPricing.effectivePrice !== cartPricing.originalPrice && (
                                <div className="text-xs text-gray-400 line-through">
                                  £{(cartPricing.originalPrice * item.quantity).toFixed(2)}
                                </div>
                              )}
                              <PriceDisplay
                                price={totalCost}
                                currency={wholesaler?.defaultCurrency || 'GBP'}
                                isGuestMode={false}
                                size="small"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.sellingType === 'pallets' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {item.sellingType === 'pallets' ? 'Pallets' : 'Units'}
                            </span>
                            {cartPricing && cartPricing.promoLabel && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                {cartPricing.promoLabel}
                              </span>
                            )}
                            {cartPricing && cartPricing.appliedOffers?.length > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                🎁 {cartPricing.appliedOffers[0]}
                              </span>
                            )}
                            {cartPricing && cartPricing.freeItems > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                +{cartPricing.freeItems} free
                              </span>
                            )}
                            {item.sellingType === 'pallets' && (
                              <span className="text-xs text-gray-500">
                                ({item.quantity * ((item.product as any).unitsPerPallet || 1)} units total)
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-gray-500 mt-1">
                            £{itemPrice.toFixed(2)} / {item.sellingType === 'pallets' ? 'pallet' : 'unit'}
                            {cartPricing && cartPricing.effectivePrice !== cartPricing.originalPrice && (
                              <span className="ml-1 text-gray-400 line-through">£{cartPricing.originalPrice.toFixed(2)}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              if (item.quantity <= moq) {
                                setCart((prev: CartItem[]) => prev.filter(c => !(c.product.id === item.product.id && c.sellingType === item.sellingType)));
                              } else {
                                const next = item.quantity - 1;
                                setEditableQuantities(prev => ({ ...prev, [eqKey]: String(next) }));
                                setCart((prev: CartItem[]) => prev.map(c => c.product.id === item.product.id && c.sellingType === item.sellingType ? { ...c, quantity: next } : c));
                              }
                            }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <input
                            type="number"
                            value={currentEditVal}
                            onChange={e => setEditableQuantities(prev => ({ ...prev, [item.product.id]: e.target.value }))}
                            onBlur={e => commitQty(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') commitQty((e.target as HTMLInputElement).value); }}
                            className="w-14 text-center border border-gray-300 rounded px-1 py-0.5 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              const next = Math.min(item.quantity + 1, availableStock);
                              setEditableQuantities(prev => ({ ...prev, [eqKey]: String(next) }));
                              setCart((prev: CartItem[]) => prev.map(c => c.product.id === item.product.id && c.sellingType === item.sellingType ? { ...c, quantity: next } : c));
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 h-7 text-xs px-2"
                          onClick={() => setCart((prev: CartItem[]) => prev.filter(c => !(c.product.id === item.product.id && c.sellingType === item.sellingType)))}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={handleShare}
                        >
                          <Share2 className="h-3 w-3 mr-1" />
                          Share
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Separator />

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Product Subtotal</span>
                    <PriceDisplay
                      price={cartStats.subtotal}
                      currency={wholesaler?.defaultCurrency || 'GBP'}
                      isGuestMode={false}
                      size="small"
                    />
                  </div>

                  {customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate && parseFloat(wholesaler.deliveryFlatRate) > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>Delivery</span>
                      <PriceDisplay
                        price={parseFloat(wholesaler.deliveryFlatRate)}
                        currency={wholesaler?.defaultCurrency || 'GBP'}
                        isGuestMode={false}
                        size="small"
                      />
                    </div>
                  )}

                  <div className="flex justify-between text-gray-600">
                    <span>Transaction Fee (5.5% + £0.50)</span>
                    <PriceDisplay
                      price={(() => {
                        const subtotal = cartStats.subtotal;
                        const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                        const beforeFees = subtotal + shipping;
                        return (beforeFees * 0.055) + 0.50;
                      })()}
                      currency={wholesaler?.defaultCurrency || 'GBP'}
                      isGuestMode={false}
                      size="small"
                    />
                  </div>
                </div>

                <Separator />
                <div className="flex justify-between items-center font-semibold text-lg">
                  <span>Total to Pay</span>
                  <PriceDisplay
                    price={(() => {
                      const subtotal = cartStats.subtotal;
                      const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                      const beforeFees = subtotal + shipping;
                      const transactionFee = (beforeFees * 0.055) + 0.50;
                      return beforeFees + transactionFee;
                    })()}
                    currency={wholesaler?.defaultCurrency || 'GBP'}
                    isGuestMode={false}
                    size="medium"
                  />
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-4 h-4 text-blue-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Payment Processing Fee</p>
                    <p>A transaction fee of 5.5% + £0.50 is applied to cover secure payment processing and platform services.</p>
                  </div>
                </div>
              </div>

              {wholesaler?.deliveryNote && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM3 4h14l-1.68 8.39A2 2 0 0113.35 14H6.65a2 2 0 01-1.97-1.61L3 4z" />
                    </svg>
                    <div className="text-sm text-amber-800">
                      <p className="font-medium mb-0.5">Delivery Information</p>
                      <p>{wholesaler.deliveryNote}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Customer Information Form */}
            <div className="space-y-4">
              <h3 className="font-semibold">Customer Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer-name">Full Name</Label>
                  <Input
                    id="customer-name"
                    value={customerData.name}
                    onChange={(e) => setCustomerData((prev: any) => ({...prev, name: e.target.value}))}
                    placeholder="Enter your full name"
                  />
                </div>
                <div>
                  <Label htmlFor="customer-email">Email</Label>
                  <Input
                    id="customer-email"
                    type="email"
                    value={customerData.email}
                    onChange={(e) => setCustomerData((prev: any) => ({...prev, email: e.target.value}))}
                    placeholder="Enter your email"
                  />
                </div>
                <div>
                  <Label htmlFor="customer-phone">Phone</Label>
                  <Input
                    id="customer-phone"
                    value={customerData.phone}
                    onChange={(e) => setCustomerData((prev: any) => ({...prev, phone: e.target.value}))}
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>
            </div>

            {/* Shipping Options */}
            <div className="space-y-4">
              <h3 className="font-semibold">
                Delivery Options
                {!customerData.shippingOption && (
                  <span className="text-red-500 ml-2 text-sm">*Required</span>
                )}
              </h3>
              <div className="space-y-3">
                <div className={`flex items-center space-x-2 p-2 rounded-lg border-2 transition-colors ${customerData.shippingOption === 'pickup' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  <input
                    type="radio"
                    id="pickup"
                    name="shipping"
                    value="pickup"
                    checked={customerData.shippingOption === 'pickup'}
                    onChange={async () => {
                      console.log('🚚 PICKUP RADIO: User clicked pickup option');
                      try {
                        setCustomerData((prev: any) => ({...prev, shippingOption: 'pickup'}));
                        if (authenticatedCustomer?.id) {
                          const response = await apiRequest("POST", "/api/customer/shipping-choice", {
                            customerId: authenticatedCustomer.id,
                            shippingChoice: 'pickup'
                          });
                          if (!response.ok) {
                            console.error('🚚 ERROR: Failed to save pickup choice to backend');
                          }
                        }
                        await createPaymentIntentForCheckout('pickup');
                      } catch (error) {
                        console.error('🚚 PICKUP SELECTION ERROR:', error);
                      }
                    }}
                    className="w-4 h-4 text-emerald-600"
                  />
                  <Label htmlFor="pickup" className="flex-1 cursor-pointer">
                    <div className="flex justify-between">
                      <span>Pickup from store</span>
                      <span className="text-green-600 font-medium">FREE</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {wholesaler?.pickupAddress || wholesaler?.businessAddress ||
                       (wholesaler?.streetAddress && wholesaler?.city
                         ? `${wholesaler.streetAddress}, ${wholesaler.city}${wholesaler.postalCode ? `, ${wholesaler.postalCode}` : ''}`
                         : 'Collect your order from our location')}
                    </p>
                    {wholesaler?.pickupInstructions && (
                      <p className="text-xs text-gray-500 mt-1">{wholesaler.pickupInstructions}</p>
                    )}
                  </Label>
                </div>
                {(wholesaler?.enableDelivery !== false) && (
                  <div className={`flex items-center space-x-2 p-2 rounded-lg border-2 transition-colors ${customerData.shippingOption === 'delivery' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <input
                      type="radio"
                      id="delivery"
                      name="shipping"
                      value="delivery"
                      checked={customerData.shippingOption === 'delivery'}
                      onChange={async () => {
                        console.log('🚚 DELIVERY RADIO: User clicked delivery option');
                        setCustomerData((prev: any) => ({
                          ...prev,
                          shippingOption: 'delivery',
                          clientSecret: null
                        }));
                        setClientSecret('');
                        if (authenticatedCustomer?.id) {
                          try {
                            await apiRequest("POST", "/api/customer/shipping-choice", {
                              customerId: authenticatedCustomer.id,
                              shippingChoice: 'delivery'
                            });
                            console.log('✅ Delivery preference saved to backend');
                          } catch (error) {
                            console.error('❌ Failed to save delivery preference:', error);
                          }
                        }
                        console.log('🚚 DELIVERY SELECTED: Waiting for address selection to create payment intent');
                      }}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <Label htmlFor="delivery" className="flex-1 cursor-pointer">
                      <div className="flex justify-between">
                        <span>Home delivery</span>
                        <span className="text-blue-600 font-medium">
                          {wholesaler?.deliveryFlatRate ? `£${parseFloat(wholesaler.deliveryFlatRate).toFixed(2)}` : 'Arranged by supplier'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {wholesaler?.deliveryFlatRate
                          ? `Flat delivery fee of £${parseFloat(wholesaler.deliveryFlatRate).toFixed(2)} added at checkout`
                          : 'The supplier will contact you to arrange delivery and discuss costs'}
                      </p>
                    </Label>
                  </div>
                )}
              </div>

              {customerData.shippingOption === 'delivery' && wholesaler?.id && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Choose Delivery Address</h4>
                    {customerData.selectedDeliveryAddress && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCustomerData((prev: any) => ({
                            ...prev,
                            selectedDeliveryAddress: null,
                            addressExplicitlyCleared: true
                          }));
                        }}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Change Address
                      </Button>
                    )}
                  </div>

                  <AddressSelector
                    wholesalerId={wholesaler.id}
                    selectedAddress={customerData.selectedDeliveryAddress}
                    addressExplicitlyCleared={customerData.addressExplicitlyCleared || false}
                    onAddressSelect={(address) => {
                      console.log('🏠 Address selected in checkout:', address);
                      setCustomerData((prev: any) => ({
                        ...prev,
                        address: address ? `${address.addressLine1}${address.addressLine2 ? ', ' + address.addressLine2 : ''}` : '',
                        city: address?.city || '',
                        postalCode: address?.postalCode || '',
                        state: address?.state || '',
                        country: address?.country || '',
                        selectedDeliveryAddress: address,
                        addressExplicitlyCleared: false,
                        shippingOption: 'delivery'
                      }));

                      if (address) {
                        setClientSecret('');
                        const updatedCustomerData = {
                          ...customerData,
                          address: `${address.addressLine1}${address.addressLine2 ? ', ' + address.addressLine2 : ''}`,
                          city: address.city,
                          postalCode: address.postalCode,
                          state: address.state || '',
                          country: address.country || '',
                          selectedDeliveryAddress: address,
                          shippingOption: 'delivery' as const
                        };
                        createPaymentIntentWithCustomData(updatedCustomerData, 'delivery');
                      }
                    }}
                    compact={true}
                  />

                  {(!wholesaler?.deliveryFlatRate || parseFloat(wholesaler.deliveryFlatRate) === 0) && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <h5 className="font-medium text-blue-800 mb-1">Delivery Arrangement</h5>
                      <p className="text-sm text-blue-700">
                        The supplier will contact you within 24 hours to discuss delivery options,
                        timing, and costs based on your location and order size.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Order Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Order Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={customerData.notes}
                onChange={(e) => setCustomerData((prev: any) => ({...prev, notes: e.target.value}))}
                placeholder="Add any special instructions for your order"
                rows={3}
              />
            </div>

            {/* Payment Form */}
            <div className="border-t pt-6">
              {customerData.shippingOption && (
                <div className="mb-5">
                  <h3 className="font-semibold mb-2">Payment Method</h3>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setPayLaterMode(false);
                        if (customerData.shippingOption && !clientSecret && !isCreatingIntent) {
                          createPaymentIntentForCheckout(customerData.shippingOption);
                        }
                      }}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        !payLaterMode
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      💳 Pay Now
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPayLaterMode(true);
                        setClientSecret('');
                      }}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        payLaterMode
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      📋 Pay Later
                    </button>
                  </div>
                  {payLaterMode && (
                    <p className="text-xs text-blue-700 mt-1.5">
                      Your order will be placed now. The supplier will contact you to arrange payment.
                    </p>
                  )}
                </div>
              )}

              {/* Pay Later — place order directly */}
              {payLaterMode && customerData.shippingOption ? (
                <div className="space-y-3">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 font-medium">Pay Later — No payment required now</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Your order total of{' '}
                      <strong>
                        {(() => {
                          const subtotal = cartStats.subtotal;
                          const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate
                            ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                          const beforeFees = subtotal + shipping;
                          const transactionFee = (beforeFees * 0.055) + 0.50;
                          return `£${(beforeFees + transactionFee).toFixed(2)}`;
                        })()}
                      </strong>{' '}
                      will be due on invoice. The supplier will be notified of your order.
                    </p>
                  </div>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={isPlacingPayLaterOrder || !customerData.shippingOption || (customerData.shippingOption === 'delivery' && !customerData.selectedDeliveryAddress)}
                    onClick={async () => {
                      if (!wholesaler?.id) return;
                      setIsPlacingPayLaterOrder(true);
                      try {
                        const cartItems = cart.map(cartItem => ({
                          productId: cartItem.product.id,
                          quantity: cartItem.quantity,
                          sellingType: cartItem.sellingType,
                        }));
                        const response = await fetch('/api/marketplace/create-order-pay-later', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            cart: cartItems,
                            customerData: {
                              name: customerData.name,
                              email: customerData.email,
                              phone: customerData.phone,
                            },
                            shippingOption: customerData.shippingOption,
                            wholesalerId: wholesaler.id,
                            notes: customerData.notes || null,
                            selectedDeliveryAddress: customerData.selectedDeliveryAddress || null,
                            selectedDeliveryAddressId: customerData.selectedDeliveryAddress?.id || null,
                          }),
                        });
                        if (!response.ok) {
                          const errData = await response.json().catch(() => ({}));
                          throw new Error(errData.message || 'Failed to place order');
                        }
                        const orderData = await response.json();
                        const currentShippingOption = customerData.shippingOption;
                        const computedSubtotal = cartStats.subtotal;
                        const computedShipping = currentShippingOption === 'delivery' && wholesaler?.deliveryFlatRate
                          ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                        const computedBeforeFees = computedSubtotal + computedShipping;
                        const computedTransactionFee = (computedBeforeFees * 0.055) + 0.50;
                        const computedTotal = computedBeforeFees + computedTransactionFee;
                        setCompletedOrder({
                          orderNumber: orderData.orderNumber || `Order #${orderData.orderId}`,
                          cart: cart.map(cartItem => ({
                            product: cartItem.product,
                            quantity: cartItem.quantity,
                            sellingType: cartItem.sellingType,
                          })),
                          customerData: {
                            ...customerData,
                            shippingOption: currentShippingOption,
                            selectedDeliveryAddress: customerData.selectedDeliveryAddress,
                          },
                          subtotal: computedSubtotal,
                          transactionFee: computedTransactionFee,
                          shippingCost: computedShipping,
                          totalAmount: computedTotal,
                          payLater: true,
                        });
                        setCart([]);
                        setPayLaterMode(false);
                        setClientSecret('');
                        setLastUsedShippingOption(null);
                        setCustomerData((prev: any) => ({
                          ...prev,
                          shippingOption: undefined,
                          selectedDeliveryAddress: null,
                          addressExplicitlyCleared: false,
                          selectedShippingService: undefined,
                        }));
                        refetchProducts();
                        if (featuredProductId) refetchFeaturedProduct();
                        queryClient.invalidateQueries({ queryKey: ["/api/customer-orders/stats"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/customer-orders"] });
                        setShowCheckout(false);
                        setShowThankYou(true);
                        toast({
                          title: "Order Placed!",
                          description: `${orderData.orderNumber} — Pay Later order confirmed. The supplier will contact you.`,
                        });
                      } catch (err: unknown) {
                        toast({
                          title: "Order Failed",
                          description: err instanceof Error ? err.message : "Failed to place order. Please try again.",
                          variant: "destructive",
                        });
                      } finally {
                        setIsPlacingPayLaterOrder(false);
                      }
                    }}
                  >
                    {isPlacingPayLaterOrder ? 'Placing Order...' : 'Place Order (Pay Later)'}
                  </Button>
                </div>
              ) : (
                <>
                  {customerData.shippingOption === 'delivery' && !customerData.selectedDeliveryAddress ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
                      <h4 className="font-medium text-amber-800 mb-1">Delivery address needed</h4>
                      <p className="text-sm text-amber-700">
                        Please add or select a delivery address above to continue with your order.
                      </p>
                    </div>
                  ) : customerData.shippingOption ? (
                    <StripeCheckoutForm
                      cart={cart}
                      customerData={customerData}
                      wholesaler={wholesaler}
                      clientSecret={clientSecret}
                      totalAmount={(() => {
                        const subtotal = cartStats.subtotal;
                        const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate
                          ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                        const beforeFees = subtotal + shipping;
                        const transactionFee = (beforeFees * 0.055) + 0.50;
                        return beforeFees + transactionFee;
                      })()}
                      onSuccess={(orderData) => {
                        console.log('🛒 Payment successful, received order data:', orderData);

                        const orderItems = cart.map(cartItem => {
                          let computedTotal: number;
                          let promoLabel: string | undefined;
                          if (cartItem.sellingType === 'pallets') {
                            computedTotal = parseFloat((cartItem.product as any).palletPrice || '0') * cartItem.quantity;
                          } else {
                            const pricing = calculatePromotionalPricing(cartItem.product, cartItem.quantity);
                            computedTotal = pricing.totalCost;
                            promoLabel = pricing.appliedOffers.length > 0 ? pricing.appliedOffers[0] : undefined;
                          }
                          return {
                            product: {
                              ...cartItem.product,
                              id: cartItem.product.id,
                              name: cartItem.product.name,
                              price: cartItem.product.price,
                              image: (cartItem.product as any).image,
                              promoPrice: cartItem.product.promoPrice,
                              promoActive: cartItem.product.promoActive,
                              promotionalOffers: cartItem.product.promotionalOffers,
                              palletPrice: (cartItem.product as any).palletPrice
                            },
                            quantity: cartItem.quantity,
                            sellingType: cartItem.sellingType,
                            computedTotal,
                            promoLabel
                          };
                        });

                        const currentShippingOption = customerData.shippingOption;

                        const orderDataWithCart = {
                          ...orderData,
                          cart: orderItems,
                          customerData: {
                            ...customerData,
                            shippingOption: currentShippingOption,
                            selectedDeliveryAddress: customerData.selectedDeliveryAddress
                          },
                          wholesaler: wholesaler,
                        };
                        setCompletedOrder(orderDataWithCart);

                        setCart([]);

                        setPayLaterMode(false);
                        setClientSecret('');
                        setLastUsedShippingOption(null);
                        setCustomerData((prev: any) => ({
                          ...prev,
                          shippingOption: undefined,
                          selectedDeliveryAddress: null,
                          addressExplicitlyCleared: false,
                          selectedShippingService: undefined,
                        }));

                        refetchProducts();
                        if (featuredProductId) refetchFeaturedProduct();

                        queryClient.invalidateQueries({ queryKey: ["/api/customer-orders/stats"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/customer-orders"] });
                        setShowCheckout(false);
                        setShowThankYou(true);
                      }}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
