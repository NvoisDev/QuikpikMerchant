import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Star, Package, Filter, Grid, List, Users, TrendingUp, Award } from "lucide-react";
import { formatCurrency } from "@/lib/currencies";

// Utility function to format numbers with commas
const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString();
};
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
  "Groceries & Food",
  "Fresh Produce",
  "Beverages & Drinks",
  "Snacks & Confectionery",
  "Personal Care & Hygiene",
  "Household Cleaning",
  "Health & Pharmacy",
  "Baby & Childcare",
  "Pet Food & Supplies",
  "Electronics & Gadgets",
  "Home & Kitchen",
  "Clothing & Fashion",
  "Sports & Fitness",
  "Books & Stationery",
  "Toys & Games",
  "Hardware & Tools",
  "Garden & Outdoor",
  "Automotive Supplies",
  "Beauty & Cosmetics",
  "Other"
];

const locations = [
  "All Locations",
  "London",
  "Manchester",
  "Birmingham",
  "Leeds",
  "Glasgow",
  "Liverpool",
  "Newcastle",
  "Sheffield",
  "Bristol",
  "Edinburgh",
  "Leicester",
  "Coventry",
  "Bradford",
  "Cardiff",
  "Belfast",
  "Nottingham",
  "Plymouth",
  "Stoke-on-Trent",
  "Wolverhampton"
];

export default function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [viewMode, setViewMode] = useState<"featured" | "products" | "wholesalers">("featured");
  const [layoutMode, setLayoutMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState("featured");
  const [selectedLocation, setSelectedLocation] = useState("All Locations");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const { data: products = [], isLoading: productsLoading } = useQuery<MarketplaceProduct[]>({
    queryKey: ["/api/marketplace/products", searchQuery, selectedCategory, sortBy, selectedLocation, priceRange, ratingFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedCategory !== "All Categories") params.append("category", selectedCategory);
      if (selectedLocation !== "All Locations") params.append("location", selectedLocation);
      params.append("sortBy", sortBy);
      params.append("minPrice", priceRange[0].toString());
      params.append("maxPrice", priceRange[1].toString());
      if (ratingFilter > 0) params.append("minRating", ratingFilter.toString());
      
      const response = await fetch(`/api/marketplace/products?${params}`);
      if (!response.ok) throw new Error("Failed to fetch marketplace products");
      return response.json();
    },
    enabled: viewMode === "products",
  });

  const { data: featuredData, isLoading: featuredLoading } = useQuery({
    queryKey: ["/api/marketplace/featured"],
    queryFn: async () => {
      const response = await fetch("/api/marketplace/featured");
      if (!response.ok) throw new Error("Failed to fetch featured data");
      return response.json();
    },
    enabled: viewMode === "featured",
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
    const matchesPrice = parseFloat(product.price) >= priceRange[0] && parseFloat(product.price) <= priceRange[1];
    const matchesRating = ratingFilter === 0 || (product.wholesaler.rating || 0) >= ratingFilter;
    
    return matchesSearch && matchesCategory && matchesPrice && matchesRating;
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
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">Marketplace Discovery</h1>
            <p className="text-lg text-blue-100">Connect with verified wholesalers across the UK</p>
            <div className="mt-6 max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search products, wholesalers, or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-lg bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { key: "featured", label: "Featured", icon: Star },
              { key: "products", label: "All Products", icon: Package },
              { key: "wholesalers", label: "Wholesalers", icon: MapPin }
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key as any)}
                className={`flex items-center space-x-2 py-4 px-2 border-b-2 font-medium text-sm ${
                  viewMode === key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      {viewMode !== "featured" && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2"
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
              </Button>
              
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48">
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

              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="price_low">Price: Low to High</SelectItem>
                  <SelectItem value="price_high">Price: High to Low</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center space-x-2 ml-auto">
                <Button
                  variant={layoutMode === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLayoutMode("grid")}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={layoutMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLayoutMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Advanced Filters Panel */}
            {showFilters && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Price Range: £{priceRange[0]} - £{priceRange[1]}
                    </label>
                    <div className="flex items-center space-x-4">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={priceRange[0]}
                        onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                        className="w-24"
                      />
                      <span>-</span>
                      <Input
                        type="number"
                        placeholder="Max"
                        value={priceRange[1]}
                        onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                        className="w-24"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Rating
                    </label>
                    <Select value={ratingFilter.toString()} onValueChange={(value) => setRatingFilter(Number(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any Rating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Any Rating</SelectItem>
                        <SelectItem value="3">3+ Stars</SelectItem>
                        <SelectItem value="4">4+ Stars</SelectItem>
                        <SelectItem value="5">5 Stars Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSelectedCategory("All Categories");
                        setSelectedLocation("All Locations");
                        setPriceRange([0, 1000]);
                        setRatingFilter(0);
                        setSearchQuery("");
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {viewMode === "featured" ? (
          <FeaturedView data={featuredData} isLoading={featuredLoading} />
        ) : viewMode === "products" ? (
          <ProductsView 
            products={sortedProducts} 
            isLoading={productsLoading} 
            layoutMode={layoutMode}
          />
        ) : (
          <WholesalersView 
            wholesalers={wholesalers} 
            isLoading={wholesalersLoading}
            layoutMode={layoutMode}
          />
        )}
      </div>
    </div>
  );
}

// Featured View Component
function FeaturedView({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-300 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-300 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-8 border">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Discover Amazing Wholesale Opportunities
          </h2>
          <p className="text-lg text-gray-600 mb-6">
            Connect with verified wholesalers and grow your retail business
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="text-center">
              <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900">500+ Wholesalers</h3>
              <p className="text-gray-600">Verified suppliers across the UK</p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900">10,000+ Products</h3>
              <p className="text-gray-600">Diverse inventory to choose from</p>
            </div>
            <div className="text-center">
              <div className="bg-purple-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Growing Network</h3>
              <p className="text-gray-600">Join the expanding marketplace</p>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Categories */}
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Popular Categories</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {productCategories.slice(1, 7).map((category) => (
            <Card key={category} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Package className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <h4 className="font-medium text-sm">{category}</h4>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Featured Wholesalers */}
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Top Rated Wholesalers</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4 mb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={`https://images.unsplash.com/photo-${1560472354 + i}?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100`} />
                    <AvatarFallback>W{i + 1}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-semibold">Sample Wholesaler {i + 1}</h4>
                    <div className="flex items-center space-x-1">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      ))}
                      <span className="text-sm text-gray-600">(4.{8 + i})</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-600 text-sm mb-4">
                  Specializing in quality products with fast delivery and excellent customer service.
                </p>
                <div className="flex justify-between items-center">
                  <Badge variant="secondary">{50 + i * 20} Products</Badge>
                  <Button size="sm">View Profile</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// Products View Component
function ProductsView({ 
  products, 
  isLoading, 
  layoutMode 
}: { 
  products: MarketplaceProduct[]; 
  isLoading: boolean; 
  layoutMode: "grid" | "list" 
}) {
  if (isLoading) {
    return (
      <div className={`grid gap-6 ${layoutMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-gray-300 h-48 rounded-lg mb-4"></div>
            <div className="h-4 bg-gray-300 rounded mb-2"></div>
            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
        <p className="text-gray-600">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-6 ${layoutMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
      {products.map((product) => (
        <Card key={product.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            {/* Store name and icon in top right */}
            <div className="flex justify-end mb-2">
              <div className="flex items-center space-x-1">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={product.wholesaler.profileImageUrl} />
                  <AvatarFallback>{product.wholesaler.businessName?.[0]}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-gray-600">{product.wholesaler.businessName}</span>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <img 
                src={product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=200"} 
                alt={product.name}
                className="w-20 h-20 object-cover rounded-lg"
              />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{product.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-blue-600">
                    {formatCurrency(parseFloat(product.price))}
                  </span>
                  <Badge variant="secondary">MOQ: {formatNumber(product.moq)}</Badge>
                </div>
                <div className="flex justify-end mt-2">
                  <Button size="sm">View Details</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Wholesalers View Component
function WholesalersView({ 
  wholesalers, 
  isLoading,
  layoutMode 
}: { 
  wholesalers: WholesalerWithProducts[]; 
  isLoading: boolean;
  layoutMode: "grid" | "list" 
}) {
  if (isLoading) {
    return (
      <div className={`grid gap-6 ${layoutMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-gray-300 h-32 rounded-lg mb-4"></div>
            <div className="h-4 bg-gray-300 rounded mb-2"></div>
            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (wholesalers.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No wholesalers found</h3>
        <p className="text-gray-600">Try adjusting your search</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-6 ${layoutMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
      {wholesalers.map((wholesaler) => (
        <Card key={wholesaler.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4 mb-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={wholesaler.profileImageUrl} />
                <AvatarFallback>{wholesaler.businessName?.[0] || wholesaler.firstName?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`}
                </h3>
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, j) => (
                    <Star 
                      key={j} 
                      className={`h-4 w-4 ${j < (wholesaler.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} 
                    />
                  ))}
                  <span className="text-sm text-gray-600">({wholesaler.rating || 0})</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Products:</span>
                <span className="text-sm font-medium">{wholesaler.products?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Orders:</span>
                <span className="text-sm font-medium">{wholesaler.totalOrders || 0}</span>
              </div>
            </div>
            
            <Button className="w-full">View Profile</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}