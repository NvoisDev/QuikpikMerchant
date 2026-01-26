import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Trash2, 
  Send, 
  ShoppingCart, 
  User, 
  Package, 
  Percent,
  MessageSquare,
  Mail,
  Phone,
  Link as LinkIcon,
  Copy,
  Check,
  ArrowLeft,
  UserPlus
} from "lucide-react";
import { Link } from "wouter";
import { DialogDescription } from "@/components/ui/dialog";

interface QuoteItem {
  productId: number;
  productName: string;
  originalPrice: number;
  customPrice: number;
  quantity: number;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  businessName?: string;
  email?: string;
  phoneNumber?: string;
}

interface Product {
  id: number;
  name: string;
  price: string;
  stock: number;
  imageUrl?: string;
}

export default function QuickQuote() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [sendMethod, setSendMethod] = useState<'sms' | 'email' | 'link'>('sms');
  const [copiedLink, setCopiedLink] = useState(false);
  const [createdQuote, setCreatedQuote] = useState<{
    orderNumber: string;
    paymentLink: string;
  } | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
    businessName: '',
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const addCustomerMutation = useMutation({
    mutationFn: async (data: typeof newCustomer) => {
      const response = await apiRequest('POST', '/api/customers', data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setSelectedCustomer({
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        businessName: data.businessName,
        email: data.email,
        phoneNumber: data.phoneNumber,
      });
      setAddCustomerDialogOpen(false);
      setNewCustomer({ firstName: '', lastName: '', phoneNumber: '', email: '', businessName: '' });
      toast({
        title: "Customer Added",
        description: "New customer has been added and selected.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer",
        variant: "destructive",
      });
    },
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      items: QuoteItem[];
      sendVia: 'sms' | 'email' | 'link';
    }) => {
      const response = await apiRequest('POST', '/api/quotes', data);
      return response.json();
    },
    onSuccess: (data) => {
      setCreatedQuote({
        orderNumber: data.orderNumber,
        paymentLink: data.paymentLink
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: "Quote Created",
        description: sendMethod === 'link' 
          ? "Payment link generated. Copy and share it with your customer."
          : `Quote sent to customer via ${sendMethod.toUpperCase()}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create quote",
        variant: "destructive",
      });
    },
  });

  const addProduct = (product: Product) => {
    const existingIndex = quoteItems.findIndex(item => item.productId === product.id);
    if (existingIndex >= 0) {
      const updated = [...quoteItems];
      updated[existingIndex].quantity += 1;
      setQuoteItems(updated);
    } else {
      setQuoteItems([...quoteItems, {
        productId: product.id,
        productName: product.name,
        originalPrice: parseFloat(product.price),
        customPrice: parseFloat(product.price),
        quantity: 1,
      }]);
    }
    setProductDialogOpen(false);
  };

  const updateItemPrice = (index: number, newPrice: number) => {
    const updated = [...quoteItems];
    updated[index].customPrice = newPrice;
    setQuoteItems(updated);
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    const updated = [...quoteItems];
    updated[index].quantity = quantity;
    setQuoteItems(updated);
  };

  const removeItem = (index: number) => {
    setQuoteItems(quoteItems.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return quoteItems.reduce((sum, item) => sum + (item.customPrice * item.quantity), 0);
  };

  const calculateSavings = () => {
    const originalTotal = quoteItems.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
    return originalTotal - calculateTotal();
  };

  const handleCreateQuote = () => {
    if (!selectedCustomer) {
      toast({
        title: "Select Customer",
        description: "Please select a customer first",
        variant: "destructive",
      });
      return;
    }

    if (quoteItems.length === 0) {
      toast({
        title: "Add Products",
        description: "Please add at least one product to the quote",
        variant: "destructive",
      });
      return;
    }

    createQuoteMutation.mutate({
      customerId: selectedCustomer.id,
      items: quoteItems,
      sendVia: sendMethod,
    });
  };

  const copyPaymentLink = () => {
    if (createdQuote?.paymentLink) {
      navigator.clipboard.writeText(createdQuote.paymentLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({
        title: "Link Copied",
        description: "Payment link copied to clipboard",
      });
    }
  };

  const resetQuote = () => {
    setSelectedCustomer(null);
    setQuoteItems([]);
    setCreatedQuote(null);
    setSendMethod('sms');
  };

  if (createdQuote) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center p-4 md:p-6">
            <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-green-100 rounded-full flex items-center justify-center mb-3 md:mb-4">
              <Check className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
            </div>
            <CardTitle className="text-xl md:text-2xl">Quote Created!</CardTitle>
            <CardDescription className="text-sm">
              Order #{createdQuote.orderNumber} is awaiting payment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 md:p-6 pt-0">
            <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
              <Label className="text-xs md:text-sm text-gray-600">Payment Link</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input 
                  value={createdQuote.paymentLink} 
                  readOnly 
                  className="flex-1 bg-white text-xs md:text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyPaymentLink}
                  className="shrink-0"
                >
                  {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {sendMethod === 'link' && (
              <p className="text-xs md:text-sm text-gray-600 text-center">
                Share this link with your customer to collect payment.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 md:pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={resetQuote}
              >
                New Quote
              </Button>
              <Link href="/orders" className="flex-1">
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  View Orders
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
        <Link href="/orders">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">Quick Quote</h1>
          <p className="text-sm md:text-base text-gray-600 truncate">Create quotes with custom prices</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Select Customer
                </CardTitle>
                <Dialog open={addCustomerDialogOpen} onOpenChange={setAddCustomerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50">
                      <UserPlus className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Add New</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Customer</DialogTitle>
                      <DialogDescription>Add a customer to create a quote for them.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="firstName">First Name *</Label>
                          <Input
                            id="firstName"
                            value={newCustomer.firstName}
                            onChange={(e) => setNewCustomer({...newCustomer, firstName: e.target.value})}
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            value={newCustomer.lastName}
                            onChange={(e) => setNewCustomer({...newCustomer, lastName: e.target.value})}
                            placeholder="Doe"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="phoneNumber">Phone Number *</Label>
                        <Input
                          id="phoneNumber"
                          value={newCustomer.phoneNumber}
                          onChange={(e) => setNewCustomer({...newCustomer, phoneNumber: e.target.value})}
                          placeholder="+44 7700 900000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                          placeholder="john@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="businessName">Business Name</Label>
                        <Input
                          id="businessName"
                          value={newCustomer.businessName}
                          onChange={(e) => setNewCustomer({...newCustomer, businessName: e.target.value})}
                          placeholder="Acme Ltd"
                        />
                      </div>
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700"
                        disabled={!newCustomer.firstName || !newCustomer.phoneNumber || addCustomerMutation.isPending}
                        onClick={() => addCustomerMutation.mutate(newCustomer)}
                      >
                        {addCustomerMutation.isPending ? "Adding..." : "Add Customer"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedCustomer?.id || ""}
                onValueChange={(value) => {
                  const customer = customers.find(c => c.id === value);
                  setSelectedCustomer(customer || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      <div className="flex flex-col">
                        <span>{customer.businessName || `${customer.firstName} ${customer.lastName}`}</span>
                        <span className="text-xs text-gray-500">{customer.phoneNumber}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedCustomer && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">
                    {selectedCustomer.businessName || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`}
                  </div>
                  {selectedCustomer.email && (
                    <div className="text-sm text-gray-600 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {selectedCustomer.email}
                    </div>
                  )}
                  {selectedCustomer.phoneNumber && (
                    <div className="text-sm text-gray-600 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {selectedCustomer.phoneNumber}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Quote Items
                </CardTitle>
                <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      <Plus className="h-4 w-4 mr-1" /> Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Select Product</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                      {products.map((product) => (
                        <div
                          key={product.id}
                          className="p-3 border rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50 transition-colors"
                          onClick={() => addProduct(product)}
                        >
                          <div className="font-medium">{product.name}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-green-600 font-semibold">
                              £{parseFloat(product.price).toFixed(2)}
                            </span>
                            <Badge variant="secondary">
                              {product.stock} in stock
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {quoteItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No products added yet</p>
                  <p className="text-sm">Click "Add Product" to start building your quote</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {quoteItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-sm text-gray-500">
                          Original: £{item.originalPrice.toFixed(2)}
                          {item.customPrice < item.originalPrice && (
                            <Badge variant="secondary" className="ml-2 text-green-600">
                              <Percent className="h-3 w-3 mr-1" />
                              {((1 - item.customPrice / item.originalPrice) * 100).toFixed(0)}% off
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <Label className="text-xs text-gray-500">Price</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.customPrice}
                            onChange={(e) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                            className="h-8"
                          />
                        </div>
                        <div className="w-20">
                          <Label className="text-xs text-gray-500">Qty</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                            className="h-8"
                          />
                        </div>
                        <div className="w-24 text-right">
                          <Label className="text-xs text-gray-500">Total</Label>
                          <div className="font-semibold">
                            £{(item.customPrice * item.quantity).toFixed(2)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quote Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Items</span>
                <span>{quoteItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>
              {calculateSavings() > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Customer Savings</span>
                  <span>-£{calculateSavings().toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>£{calculateTotal().toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send Quote</CardTitle>
              <CardDescription>How would you like to share the payment link?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={sendMethod === 'sms' ? 'default' : 'outline'}
                  className={sendMethod === 'sms' ? 'bg-green-600' : ''}
                  onClick={() => setSendMethod('sms')}
                >
                  <MessageSquare className="h-4 w-4 mr-1" />
                  SMS
                </Button>
                <Button
                  variant={sendMethod === 'email' ? 'default' : 'outline'}
                  className={sendMethod === 'email' ? 'bg-green-600' : ''}
                  onClick={() => setSendMethod('email')}
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Email
                </Button>
                <Button
                  variant={sendMethod === 'link' ? 'default' : 'outline'}
                  className={sendMethod === 'link' ? 'bg-green-600' : ''}
                  onClick={() => setSendMethod('link')}
                >
                  <LinkIcon className="h-4 w-4 mr-1" />
                  Link
                </Button>
              </div>

              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
                disabled={!selectedCustomer || quoteItems.length === 0 || createQuoteMutation.isPending}
                onClick={handleCreateQuote}
              >
                {createQuoteMutation.isPending ? (
                  "Creating Quote..."
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create & Send Quote
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
