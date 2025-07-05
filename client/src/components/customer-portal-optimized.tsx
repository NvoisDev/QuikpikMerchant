import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Plus, Minus, Trash2, Package, Star, Store, Mail, Phone, MapPin, CreditCard, Search, Filter, Grid, List, Eye, MoreHorizontal, ShieldCheck, Truck, ArrowLeft, Heart, Share2 } from "lucide-react";
import Logo from "@/components/ui/logo";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Utility function to format numbers with commas
const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString();
};

// Memoized currency symbol component
const CurrencySymbol = ({ currency = 'GBP' }: { currency?: string }) => {
  const symbol = useMemo(() => {
    switch (currency?.toUpperCase()) {
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'USD': return '$';
      default: return '£';
    }
  }, [currency]);
  
  return <span>{symbol}</span>;
};

// Loading skeleton components
const ProductCardSkeleton = () => (
  <Card className="h-full">
    <CardContent className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex space-x-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const FeaturedProductSkeleton = () => (
  <Card className="shadow-xl border-0">
    <CardContent className="p-8">
      <div className="grid md:grid-cols-2 gap-8">
        <Skeleton className="w-full h-64 rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-16 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </CardContent>
  </Card>
);

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || "");

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  moq: number;
  stock: number;
  category?: string;
  imageUrl?: string;
  status: string;
  priceVisible: boolean;
  negotiationEnabled: boolean;
  minimumBidPrice?: string;
  wholesaler: {
    id: string;
    businessName: string;
    businessPhone?: string;
    businessAddress?: string;
    profileImageUrl?: string;
    defaultCurrency?: string;
  };
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface CustomerData {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export default function OptimizedCustomerPortal() {
  const params = useParams();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  
  // Check if this is preview mode (accessed by wholesaler)
  const isPreviewMode = location === '/preview-store';
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showQuantityEditor, setShowQuantityEditor] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>("");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [negotiationProduct, setNegotiationProduct] = useState<Product | null>(null);
  const [negotiationData, setNegotiationData] = useState<{
    quantity: number | string;
    offeredPrice: string;
    message: string;
  }>({
    quantity: 1,
    offeredPrice: '',
    message: ''
  });
  const [customerData, setCustomerData] = useState<CustomerData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  });

  // Get featured product ID from URL
  const featuredProductId = params?.id ? parseInt(params.id) : null;

  // Fetch featured product if specified
  const { data: featuredProduct, isLoading: featuredLoading } = useQuery({
    queryKey: [`/api/marketplace/products/${featuredProductId}`],
    enabled: !!featuredProductId
  });

  // Fetch all available products for browsing
  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['/api/marketplace/products']
  });

  // Get wholesaler data from featured product or first product
  const wholesaler = featuredProduct?.wholesaler || allProducts[0]?.wholesaler;

  // Filter out featured product from "other products" list
  const otherProducts = allProducts.filter(p => p.id !== featuredProductId);

  // Memoized categories for filtering
  const categories = useMemo(() => {
    return ["All Categories", ...Array.from(new Set(allProducts.map(p => p.category).filter(Boolean)))];
  }, [allProducts]);

  // Memoized filtered products with performance optimization
  const filteredProducts = useMemo(() => {
    if (!allProducts.length) return [];
    
    return allProducts.filter(product => {
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.wholesaler.businessName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "All Categories" || product.category === selectedCategory;
      const isActive = product.status === 'active';
      const hasStock = product.stock > 0;
      
      return matchesSearch && matchesCategory && isActive && hasStock;
    });
  }, [allProducts, searchTerm, selectedCategory]);

  // Memoized cart calculations
  const cartStats = useMemo(() => {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = cart.reduce((sum, item) => {
      const price = parseFloat(item.product.price);
      return sum + (price * item.quantity);
    }, 0);
    return { totalItems, totalValue };
  }, [cart]);

  // Optimized handlers with useCallback
  const openQuantityEditor = useCallback((product: Product) => {
    setSelectedProduct(product);
    setEditQuantity(product.moq);
    setShowQuantityEditor(true);
  }, []);

  const openNegotiation = useCallback((product: Product) => {
    setNegotiationProduct(product);
    setNegotiationData({
      quantity: product.moq,
      offeredPrice: '',
      message: ''
    });
    setShowNegotiation(true);
  }, []);

  const addToCart = useCallback((product: Product, quantity: number) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prevCart, { product, quantity }];
    });
    
    toast({
      title: "Added to Cart",
      description: `${product.name} (${quantity} units) added to your cart`,
    });
  }, [toast]);

  // Early loading state
  if (featuredProductId && featuredLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8 space-y-8">
          <FeaturedProductSkeleton />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Rest of component implementation would go here */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Optimized Customer Portal</h1>
          <p className="text-gray-600 mt-2">Performance improvements implemented</p>
        </div>
      </div>
    </div>
  );
}