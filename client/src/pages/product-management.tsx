import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

import ProductCard from "@/components/product-card";
import { Plus, Search, Download, Grid, List, Package, Upload, Sparkles } from "lucide-react";
import type { Product } from "@shared/schema";
import { currencies, formatCurrency } from "@/lib/currencies";

const productCategories = [
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

const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  currency: z.string().min(1, "Currency is required"),
  moq: z.string().min(1, "MOQ is required"),
  stock: z.string().min(1, "Stock is required"),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  priceVisible: z.boolean(),
  negotiationEnabled: z.boolean(),
  status: z.enum(["active", "inactive", "out_of_stock"]),
});

type ProductFormData = z.infer<typeof productFormSchema>;

export default function ProductManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      currency: "GBP",
      moq: "1",
      stock: "0",
      category: "",
      imageUrl: "",
      priceVisible: true,
      negotiationEnabled: false,
      status: "active",
    },
  });

  const generateDescription = async () => {
    try {
      setIsGeneratingDescription(true);
      const productName = form.getValues("name");
      const category = form.getValues("category");
      
      if (!productName) {
        toast({
          title: "Product Name Required",
          description: "Please enter a product name first",
          variant: "destructive",
        });
        return;
      }

      const response = await apiRequest("POST", "/api/ai/generate-description", {
        productName,
        category,
      });

      if (response.ok) {
        const data = await response.json();
        form.setValue("description", data.description);
        toast({
          title: "Description Generated",
          description: "AI-powered product description has been created",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Generation Failed",
          description: error.message || "Failed to generate description",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate description",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/products?wholesalerId=${user?.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const productData = {
        ...data,
        price: parseFloat(data.price),
        moq: parseInt(data.moq),
        stock: parseInt(data.stock),
      };
      return await apiRequest("POST", "/api/products", productData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Product created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (data: ProductFormData & { id: number }) => {
      const { id, ...productData } = data;
      const updatedData = {
        ...productData,
        price: parseFloat(productData.price),
        moq: parseInt(productData.moq),
        stock: parseInt(productData.stock),
      };
      return await apiRequest("PATCH", `/api/products/${id}`, updatedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
      toast({
        title: "Success",
        description: "Product updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Product deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProductMutation.mutate({ ...data, id: editingProduct.id });
    } else {
      createProductMutation.mutate(data);
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    form.reset({
      name: product.name,
      description: product.description || "",
      price: product.price.toString(),
      moq: product.moq.toString(),
      stock: product.stock.toString(),
      category: product.category || "",
      imageUrl: product.imageUrl || "",
      priceVisible: product.priceVisible,
      negotiationEnabled: product.negotiationEnabled,
      status: product.status,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProductMutation.mutate(id);
    }
  };

  const handleDuplicate = (product: any) => {
    // Reset the form with the product data but clear the ID to create a new product
    setEditingProduct(null); // Set to null so it creates instead of edits
    form.reset({
      name: `${product.name} (Copy)`,
      description: product.description || "",
      price: product.price.toString(),
      currency: product.currency || "GBP",
      moq: product.moq.toString(),
      stock: product.stock.toString(),
      category: product.category || "",
      imageUrl: product.imageUrl || "",
      priceVisible: product.priceVisible,
      negotiationEnabled: product.negotiationEnabled,
      status: product.status,
    });
    setIsDialogOpen(true);
  };

  const filteredProducts = products?.filter((product: any) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || product.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  }) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex-1">
        {/* Top Bar */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Product Management</h1>
              <p className="text-gray-600 mt-1">Manage your inventory, pricing, and product details.</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingProduct(null);
                    form.reset();
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingProduct ? "Edit Product" : "Add New Product"}
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Product Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter product name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {productCategories.map((category) => (
                                    <SelectItem key={category} value={category}>
                                      {category}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Description</FormLabel>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={generateDescription}
                                disabled={isGeneratingDescription}
                                className="h-8"
                              >
                                <Sparkles className="h-4 w-4 mr-1" />
                                {isGeneratingDescription ? "Generating..." : "AI Generate"}
                              </Button>
                            </div>
                            <FormControl>
                              <Textarea placeholder="Enter product description" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <FormField
                          control={form.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Price</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Currency</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select currency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {currencies.map((currency) => (
                                    <SelectItem key={currency.code} value={currency.code}>
                                      {currency.code} - {currency.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="moq"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Min Order Qty</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="1" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="stock"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Stock</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="0" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="imageUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Image URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://example.com/image.jpg" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="priceVisible"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Price Visible</FormLabel>
                                  <div className="text-sm text-muted-foreground">
                                    Show price to customers
                                  </div>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="negotiationEnabled"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Enable Negotiation</FormLabel>
                                  <div className="text-sm text-muted-foreground">
                                    Allow customers to negotiate price
                                  </div>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 mt-6">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createProductMutation.isPending || updateProductMutation.isPending}>
                          {createProductMutation.isPending || updateProductMutation.isPending ? "Saving..." : "Save Product"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Filters and Search */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {productCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">View:</span>
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Products Grid/List */}
          {isLoading ? (
            <div className={viewMode === "grid" 
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              : "space-y-4"
            }>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Card key={i} className="animate-pulse">
                  <div className="w-full h-48 bg-gray-300 rounded-t-lg"></div>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-300 rounded w-full"></div>
                      <div className="h-3 bg-gray-300 rounded w-5/6"></div>
                      <div className="h-8 bg-gray-300 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product: any) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProducts.map((product: any) => (
                <Card key={product.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-6">
                      <img 
                        src={product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100"} 
                        alt={product.name}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                            <Badge variant="secondary" className="mt-1">{product.category}</Badge>
                            {product.description && (
                              <p className="text-gray-600 text-sm mt-2 max-w-md">{product.description}</p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant={product.status === "active" ? "default" : product.status === "inactive" ? "secondary" : "destructive"}>
                              {product.status === "active" ? "Active" : product.status === "inactive" ? "Inactive" : "Out of Stock"}
                            </Badge>
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(product.id)} className="text-red-600 hover:text-red-700">
                              Delete
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
                          <div>
                            <span className="text-gray-500">Price:</span>
                            <div className="font-semibold">
                              {product.priceVisible ? formatCurrency(parseFloat(product.price), product.currency || "GBP") : "Hidden"}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500">MOQ:</span>
                            <div className="font-semibold">{product.moq} units</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Stock:</span>
                            <div className={`font-semibold ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {product.stock} units
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500">Views:</span>
                            <div className="font-semibold">142</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No products found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || categoryFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by creating your first product"}
              </p>
              {!(searchQuery || categoryFilter !== "all" || statusFilter !== "all") && (
                <div className="mt-6">
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
