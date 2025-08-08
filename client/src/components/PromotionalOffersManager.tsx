import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Percent, 
  Gift, 
  ShoppingCart, 
  Package,
  Calendar,
  Users,
  TrendingUp,
  Tag,
  Zap
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { getOfferTypeConfig, formatPromotionalOffersWithEmojis } from "@shared/promotional-offer-utils";
import type { PromotionalOffer, PromotionalOfferType } from "@shared/schema";

interface PromotionalOffersManagerProps {
  offers: PromotionalOffer[];
  onOffersChange: (offers: PromotionalOffer[]) => void;
  productPrice: number;
  currency: string;
  className?: string;
}

const offerTypeConfigs = {
  percentage_discount: {
    name: "Percentage Discount",
    icon: Percent,
    color: "bg-blue-500",
    description: "Percentage off the original price"
  },
  fixed_discount: {
    name: "Fixed Amount Off",
    icon: Tag,
    color: "bg-green-500",
    description: "Fixed amount discount (legacy)"
  },
  fixed_amount_discount: {
    name: "Fixed Amount Off",
    icon: Tag,
    color: "bg-green-500",
    description: "Fixed amount discount"
  },
  bogo: {
    name: "Buy One Get One Free",
    icon: Gift,
    color: "bg-purple-500",
    description: "Buy one, get one free"
  },
  buy_x_get_y_free: {
    name: "Multi-Buy Deal",
    icon: ShoppingCart,
    color: "bg-orange-500",
    description: "Buy X items, get Y free"
  },
  multi_buy: {
    name: "Multi-Buy Discount",
    icon: ShoppingCart,
    color: "bg-orange-400",
    description: "Volume discount for multiple purchases"
  },
  bulk_tier: {
    name: "Bulk Tier Pricing",
    icon: Package,
    color: "bg-yellow-600",
    description: "Different pricing levels based on quantity"
  },
  bulk_discount: {
    name: "Bulk Discount",
    icon: Package,
    color: "bg-yellow-500",
    description: "Tiered pricing for bulk orders"
  },
  fixed_price: {
    name: "Fixed Price",
    icon: Zap,
    color: "bg-red-500",
    description: "Set a fixed promotional price"
  },
  free_shipping: {
    name: "Free Shipping",
    icon: TrendingUp,
    color: "bg-indigo-500",
    description: "Free delivery on this product"
  },
  bundle_deal: {
    name: "Bundle Deal",
    icon: Package,
    color: "bg-pink-500",
    description: "Special price when bought with other products"
  }
};

export function PromotionalOffersManager({ 
  offers, 
  onOffersChange, 
  productPrice, 
  currency,
  className = ""
}: PromotionalOffersManagerProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<PromotionalOffer | null>(null);

  const createNewOffer = (type: PromotionalOfferType): PromotionalOffer => {
    const now = new Date().toISOString();
    return {
      id: `offer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `New ${offerTypeConfigs[type].name}`,
      type,
      isActive: true,
      description: offerTypeConfigs[type].description,
      createdAt: now,
      updatedAt: now,
    };
  };

  const addOffer = (type: PromotionalOfferType) => {
    const newOffer = createNewOffer(type);
    onOffersChange([...offers, newOffer]);
    setEditingOffer(newOffer);
  };

  const updateOffer = (updatedOffer: PromotionalOffer) => {
    const updatedOffers = offers.map(offer => 
      offer.id === updatedOffer.id 
        ? { ...updatedOffer, updatedAt: new Date().toISOString() }
        : offer
    );
    onOffersChange(updatedOffers);
    setEditingOffer(null);
  };

  const removeOffer = (offerId: string) => {
    onOffersChange(offers.filter(offer => offer.id !== offerId));
  };

  const toggleOfferActive = (offerId: string) => {
    const updatedOffers = offers.map(offer => 
      offer.id === offerId 
        ? { ...offer, isActive: !offer.isActive, updatedAt: new Date().toISOString() }
        : offer
    );
    onOffersChange(updatedOffers);
  };

  const getOfferDisplayValue = (offer: PromotionalOffer) => {
    switch (offer.type) {
      case 'percentage_discount':
        return `${offer.discountPercentage}% OFF`;
      case 'fixed_amount_discount':
        return `${formatCurrency(offer.discountAmount || 0)} OFF`;
      case 'bogo':
        return 'Buy 1 Get 1 FREE';
      case 'buy_x_get_y_free':
        return `Buy ${offer.buyQuantity} Get ${offer.getQuantity} FREE`;
      case 'bulk_discount':
        return `Bulk pricing available`;
      case 'fixed_price':
        return `${formatCurrency(offer.fixedPrice || 0)} each`;
      case 'free_shipping':
        return 'FREE SHIPPING';
      case 'bundle_deal':
        return `Bundle: ${formatCurrency(offer.bundlePrice || 0)}`;
      default:
        return offer.name;
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Promotional Offers</h3>
          <p className="text-sm text-gray-600">Add special offers to make your campaign more attractive</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Offer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choose Promotional Offer Type</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(offerTypeConfigs).map(([type, config]) => {
                const Icon = config.icon;
                const emojiConfig = getOfferTypeConfig(type as PromotionalOfferType);
                return (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50"
                    onClick={() => {
                      addOffer(type as PromotionalOfferType);
                      setIsCreateOpen(false);
                    }}
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-2xl">{emojiConfig.emoji}</span>
                      <div className={`h-6 w-6 rounded-full ${config.color} flex items-center justify-center`}>
                        <Icon className="h-3 w-3 text-white" />
                      </div>
                    </div>
                    <span className="font-medium text-sm">{config.name}</span>
                    <span className="text-xs text-gray-500 mt-1">{config.description}</span>
                  </Button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {offers.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Gift className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500 text-center mb-4">No promotional offers yet</p>
            <p className="text-sm text-gray-400 text-center mb-4">
              Add special offers like discounts, BOGO deals, or bulk pricing to boost your campaign performance
            </p>
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setIsCreateOpen(true)}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Offer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const config = offerTypeConfigs[offer.type];
            const emojiConfig = getOfferTypeConfig(offer.type);
            const Icon = config.icon;
            
            return (
              <Card key={offer.id} className={`${offer.isActive ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-gray-300'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">{emojiConfig.emoji}</span>
                        <div className={`h-6 w-6 rounded-full ${config.color} flex items-center justify-center`}>
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{offer.name}</h4>
                          <Badge 
                            variant={offer.isActive ? "default" : "secondary"}
                            className={offer.isActive ? emojiConfig.color : ""}
                          >
                            {offer.isActive ? `${emojiConfig.emoji} Active` : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">{getOfferDisplayValue(offer)}</p>
                        {offer.description && (
                          <p className="text-xs text-gray-500 mt-1">{offer.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={offer.isActive}
                        onCheckedChange={() => toggleOfferActive(offer.id)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingOffer(offer)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeOffer(offer.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Offer Dialog */}
      <Dialog open={!!editingOffer} onOpenChange={() => setEditingOffer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Promotional Offer</DialogTitle>
          </DialogHeader>
          {editingOffer && (
            <OfferEditForm
              offer={editingOffer}
              productPrice={productPrice}
              currency={currency}
              onSave={updateOffer}
              onCancel={() => setEditingOffer(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface OfferEditFormProps {
  offer: PromotionalOffer;
  productPrice: number;
  currency: string;
  onSave: (offer: PromotionalOffer) => void;
  onCancel: () => void;
}

function OfferEditForm({ offer, productPrice, currency, onSave, onCancel }: OfferEditFormProps) {
  const [formData, setFormData] = useState<PromotionalOffer>(offer);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent the event from bubbling up to the parent form
    onSave(formData);
  };

  const updateFormData = (updates: Partial<PromotionalOffer>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent Enter key from submitting the parent form
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const renderOfferSpecificFields = () => {
    switch (formData.type) {
      case 'percentage_discount':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="discountPercentage">Discount Percentage</Label>
              <Input
                id="discountPercentage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.discountPercentage || ''}
                onChange={(e) => updateFormData({ discountPercentage: parseFloat(e.target.value) })}
                onKeyDown={handleKeyDown}
                placeholder="e.g., 20 for 20% off"
              />
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-600">
                Customer saves: {formatCurrency((productPrice * (formData.discountPercentage || 0)) / 100)} per unit
              </p>
              <p className="text-sm text-gray-600">
                Sale price: {formatCurrency(productPrice - (productPrice * (formData.discountPercentage || 0)) / 100)} per unit
              </p>
            </div>
          </div>
        );

      case 'fixed_amount_discount':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="discountAmount">Discount Amount ({currency})</Label>
              <Input
                id="discountAmount"
                type="number"
                min="0"
                step="0.01"
                value={formData.discountAmount || ''}
                onChange={(e) => updateFormData({ discountAmount: parseFloat(e.target.value) })}
                onKeyDown={handleKeyDown}
                placeholder="e.g., 5.00 for £5 off"
              />
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-600">
                Customer saves: {formatCurrency(formData.discountAmount || 0)} per unit
              </p>
              <p className="text-sm text-gray-600">
                Sale price: {formatCurrency(productPrice - (formData.discountAmount || 0))} per unit
              </p>
            </div>
          </div>
        );

      case 'bogo':
        return (
          <div className="space-y-4">
            <div className="bg-purple-50 p-4 rounded">
              <h4 className="font-medium text-purple-900 mb-2">Buy One Get One Free</h4>
              <p className="text-sm text-purple-700">
                Customers get 1 free item for every 1 item they purchase.
              </p>
            </div>
            <div>
              <Label htmlFor="maxQuantity">Maximum Free Items (optional)</Label>
              <Input
                id="maxQuantity"
                type="number"
                min="1"
                value={formData.maxQuantity || ''}
                onChange={(e) => updateFormData({ maxQuantity: parseInt(e.target.value) })}
                placeholder="e.g., 5 (limit 5 free items per order)"
              />
            </div>
          </div>
        );

      case 'buy_x_get_y_free':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="buyQuantity">Buy Quantity</Label>
                <Input
                  id="buyQuantity"
                  type="number"
                  min="1"
                  value={formData.buyQuantity || ''}
                  onChange={(e) => updateFormData({ buyQuantity: parseInt(e.target.value) })}
                  placeholder="e.g., 2"
                />
              </div>
              <div>
                <Label htmlFor="getQuantity">Get Free Quantity</Label>
                <Input
                  id="getQuantity"
                  type="number"
                  min="1"
                  value={formData.getQuantity || ''}
                  onChange={(e) => updateFormData({ getQuantity: parseInt(e.target.value) })}
                  placeholder="e.g., 1"
                />
              </div>
            </div>
            <div className="bg-orange-50 p-3 rounded">
              <p className="text-sm text-orange-700">
                {formData.buyQuantity && formData.getQuantity 
                  ? `Buy ${formData.buyQuantity} items, get ${formData.getQuantity} free`
                  : 'Configure buy and get quantities above'
                }
              </p>
            </div>
          </div>
        );

      case 'fixed_price':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="fixedPrice">Fixed Price ({currency})</Label>
              <Input
                id="fixedPrice"
                type="number"
                min="0"
                step="0.01"
                value={formData.fixedPrice || ''}
                onChange={(e) => updateFormData({ fixedPrice: parseFloat(e.target.value) })}
                placeholder="e.g., 15.00"
              />
            </div>
            <div className="bg-red-50 p-3 rounded">
              <p className="text-sm text-red-700">
                {formData.fixedPrice 
                  ? `Customer pays: ${formatCurrency(formData.fixedPrice)} per unit (${formatCurrency(productPrice - formData.fixedPrice)} savings)`
                  : 'Set fixed price above'
                }
              </p>
            </div>
          </div>
        );

      case 'free_shipping':
        return (
          <div className="bg-indigo-50 p-4 rounded">
            <h4 className="font-medium text-indigo-900 mb-2">Free Shipping Offer</h4>
            <p className="text-sm text-indigo-700">
              Customers get free delivery when they order this product.
            </p>
          </div>
        );

      case 'bulk_discount':
        return (
          <div className="space-y-4">
            <div>
              <Label>Bulk Discount Tiers</Label>
              <p className="text-sm text-gray-600 mb-2">Set up tiered pricing for bulk orders</p>
              <div className="space-y-2">
                {(formData.bulkTiers || []).map((tier, index) => (
                  <div key={index} className="flex space-x-2 items-center">
                    <Input
                      type="number"
                      placeholder="Min quantity"
                      value={tier.minQuantity}
                      onChange={(e) => {
                        const newTiers = [...(formData.bulkTiers || [])];
                        newTiers[index] = { ...tier, minQuantity: parseInt(e.target.value) };
                        updateFormData({ bulkTiers: newTiers });
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="% discount"
                      value={tier.discountPercentage}
                      onChange={(e) => {
                        const newTiers = [...(formData.bulkTiers || [])];
                        newTiers[index] = { ...tier, discountPercentage: parseFloat(e.target.value) };
                        updateFormData({ bulkTiers: newTiers });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newTiers = (formData.bulkTiers || []).filter((_, i) => i !== index);
                        updateFormData({ bulkTiers: newTiers });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newTiers = [...(formData.bulkTiers || []), { minQuantity: 0, discountPercentage: 0 }];
                    updateFormData({ bulkTiers: newTiers });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tier
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Offer Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Summer Sale 20% Off"
          />
        </div>
        <div>
          <Label htmlFor="isActive">Status</Label>
          <div className="flex items-center space-x-2 mt-2">
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => updateFormData({ isActive: checked })}
            />
            <Label htmlFor="isActive" className="text-sm">
              {formData.isActive ? 'Active' : 'Inactive'}
            </Label>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => updateFormData({ description: e.target.value })}
          placeholder="Describe this offer for customers..."
          rows={2}
        />
      </div>

      {renderOfferSpecificFields()}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate">Start Date (optional)</Label>
          <Input
            id="startDate"
            type="datetime-local"
            value={formData.startDate ? new Date(formData.startDate).toISOString().slice(0, 16) : ''}
            onChange={(e) => updateFormData({ startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div>
          <Label htmlFor="endDate">End Date (optional)</Label>
          <Input
            id="endDate"
            type="datetime-local"
            value={formData.endDate ? new Date(formData.endDate).toISOString().slice(0, 16) : ''}
            onChange={(e) => updateFormData({ endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <Separator />

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          Save Offer
        </Button>
      </div>
    </form>
  );
}