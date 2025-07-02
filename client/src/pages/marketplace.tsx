import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Star, Package, Filter, Grid, List } from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import type { Product, User } from "@shared/schema";

interface WholesalerWithProducts extends User {
  products: Product[];
  rating?: number;
  totalOrders?: number;
}

interface MarketplaceProduct extends Product {
  wholesaler: {
    id: string;
    businessName: string;
    profileImageUrl?: string;
    rating?: number;
  };
}

const productCategories = [
  "All Categories",
  "Electronics & Technology",
  "Clothing & Apparel", 
  "Home & Garden",
  "Health & Beauty",
  "Food & Beverages",
  "Sports & Recreation",
  "Automotive & Transportation",
  "Industrial & Manufacturing",
  "Office & Business Supplies",
  "Toys & Games",
  "Books & Media",
  "Jewelry & Accessories",
  "Baby & Kids",
  "Pet Supplies",
  "Arts & Crafts",
  "Tools & Hardware",
  "Construction & Building",
  "Agriculture & Farming",
  "Medical & Healthcare",
  "Other"
];

export default function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [viewMode, setViewMode] = useState<"products" | "wholesalers">("products");
  const [layoutMode, setLayoutMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState("featured");

  const { data: products = [], isLoading: productsLoading } = useQuery<MarketplaceProduct[]>({
    queryKey: ["/api/marketplace/products", searchQuery, selectedCategory, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedCategory !== "All Categories") params.append("category", selectedCategory);
      params.append("sortBy", sortBy);
      
      const response = await fetch(`/api/marketplace/products?${params}`);
      if (!response.ok) throw new Error("Failed to fetch marketplace products");
      return response.json();
    },
  });

  const { data: wholesalers = [], isLoading: wholesalersLoading } = useQuery<WholesalerWithProducts[]>({
    queryKey: ["/api/marketplace/wholesalers", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      
      const response = await fetch(`/api/marketplace/wholesalers?${params}`);
      if (!response.ok) throw new Error("Failed to fetch wholesalers");
      return response.json();
    },
    enabled: viewMode === "wholesalers",
  });

  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.wholesaler.businessName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === "All Categories" || product.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "price_low":
        return parseFloat(a.price) - parseFloat(b.price);
      case "price_high":
        return parseFloat(b.price) - parseFloat(a.price);
      case "newest":
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case "rating":
        return (b.wholesaler.rating || 0) - (a.wholesaler.rating || 0);
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Marketplace</h1>
              <p className="text-gray-600">Discover products from verified wholesalers</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <Button
                  variant={viewMode === "products" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("products")}
                >
                  <Package className="h-4 w-4 mr-1" />
                  Products
                </Button>
                <Button
                  variant={viewMode === "wholesalers" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("wholesalers")}
                >
                  <MapPin className="h-4 w-4 mr-1" />
                  Wholesalers
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={viewMode === "products" ? "Search products..." : "Search wholesalers..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {viewMode === "products" && (
                <>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {productCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full md:w-40">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="featured">Featured</SelectItem>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="price_low">Price: Low to High</SelectItem>
                      <SelectItem value="price_high">Price: High to Low</SelectItem>
                      <SelectItem value="rating">Rating</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center bg-gray-100 rounded-lg p-1">
                    <Button
                      variant={layoutMode === "grid" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLayoutMode("grid")}
                    >
                      <Grid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={layoutMode === "list" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLayoutMode("list")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {viewMode === "products" ? (
          <ProductsView 
            products={sortedProducts} 
            loading={productsLoading} 
            layoutMode={layoutMode}
          />
        ) : (
          <WholesalersView 
            wholesalers={wholesalers} 
            loading={wholesalersLoading}
          />
        )}
      </div>
    </div>
  );
}

function ProductsView({ 
  products, 
  loading, 
  layoutMode 
}: { 
  products: MarketplaceProduct[]; 
  loading: boolean; 
  layoutMode: "grid" | "list";
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-48 bg-gray-200 rounded-t-lg"></div>
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded mb-4"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
        <p className="text-gray-600">Try adjusting your search or filters</p>
      </div>
    );
  }

  if (layoutMode === "list") {
    return (
      <div className="space-y-4">
        {products.map((product) => (
          <Card key={product.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">
                    {product.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {product.description}
                  </p>
                  
                  <div className="flex items-center mt-2 space-x-4">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={product.wholesaler.profileImageUrl} />
                        <AvatarFallback>
                          {product.wholesaler.businessName?.charAt(0) || 'W'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-600">
                        {product.wholesaler.businessName}
                      </span>
                    </div>
                    
                    {product.wholesaler.rating && (
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-400 fill-current" />
                        <span className="text-sm text-gray-600">
                          {product.wholesaler.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(parseFloat(product.price), product.currency || "GBP")}
                  </div>
                  <div className="text-sm text-gray-600">
                    MOQ: {product.moq}
                  </div>
                  <Badge variant={product.status === "active" ? "default" : "secondary"} className="mt-2">
                    {product.category}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <Card key={product.id} className="hover:shadow-md transition-shadow">
          <div className="h-48 bg-gray-200 rounded-t-lg overflow-hidden">
            {product.imageUrl ? (
              <img 
                src={product.imageUrl} 
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-12 w-12 text-gray-400" />
              </div>
            )}
          </div>
          
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={product.wholesaler.profileImageUrl} />
                <AvatarFallback>
                  {product.wholesaler.businessName?.charAt(0) || 'W'}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-600 truncate">
                {product.wholesaler.businessName}
              </span>
              {product.wholesaler.rating && (
                <div className="flex items-center space-x-1 ml-auto">
                  <Star className="h-4 w-4 text-yellow-400 fill-current" />
                  <span className="text-xs text-gray-600">
                    {product.wholesaler.rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
            
            <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">
              {product.name}
            </h3>
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {product.description}
            </p>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">
                  {formatCurrency(parseFloat(product.price), product.currency || "GBP")}
                </div>
                <div className="text-xs text-gray-600">
                  MOQ: {product.moq}
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {product.category}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WholesalersView({ 
  wholesalers, 
  loading 
}: { 
  wholesalers: WholesalerWithProducts[]; 
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (wholesalers.length === 0) {
    return (
      <div className="text-center py-12">
        <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No wholesalers found</h3>
        <p className="text-gray-600">Try adjusting your search</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {wholesalers.map((wholesaler) => (
        <Card key={wholesaler.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4 mb-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={wholesaler.profileImageUrl || undefined} />
                <AvatarFallback className="text-lg">
                  {wholesaler.businessName?.charAt(0) || wholesaler.firstName?.charAt(0) || 'W'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  {wholesaler.rating && (
                    <div className="flex items-center space-x-1">
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <span className="text-sm text-gray-600">
                        {wholesaler.rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {wholesaler.totalOrders && (
                    <span className="text-sm text-gray-600">
                      {wholesaler.totalOrders} orders
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Products:</span>
                <span className="font-medium">{wholesaler.products?.length || 0}</span>
              </div>
              
              {wholesaler.products && wholesaler.products.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-900 mb-2">Latest Products:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {wholesaler.products.slice(0, 3).map((product) => (
                      <div key={product.id} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        {product.imageUrl ? (
                          <img 
                            src={product.imageUrl} 
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}