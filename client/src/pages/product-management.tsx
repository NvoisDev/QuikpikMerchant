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
import { ProductGridSkeleton } from "@/components/ui/loading-skeletons";
import { Plus, Search, Download, Grid, List, Package, Upload, Sparkles, FileText, AlertCircle, CheckCircle } from "lucide-react";
import type { Product } from "@shared/schema";
import { currencies, formatCurrency } from "@/lib/currencies";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// Utility function to format numbers with commas
const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString();
};

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
  minimumBidPrice: z.string().optional(),
  status: z.enum(["active", "inactive", "out_of_stock"]),
  
  // New fields for unit types and delivery options
  unitType: z.enum(["units", "pallets"]),
  unitsPerPallet: z.string().optional(),
  deliveryOptions: z.object({
    pickup: z.boolean(),
    delivery: z.boolean(),
  }),
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
  const [isBulkUploadDialogOpen, setIsBulkUploadDialogOpen] = useState(false);
  const [uploadedProducts, setUploadedProducts] = useState<any[]>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      currency: user?.preferredCurrency || "GBP",
      moq: "1",
      stock: "0",
      category: "",
      imageUrl: "",
      priceVisible: true,
      negotiationEnabled: false,
      minimumBidPrice: "",
      status: "active",
      unitType: "units",
      unitsPerPallet: "",
      deliveryOptions: {
        pickup: true,
        delivery: true,
      },
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



  const resizeImage = (file: File, maxSizeKB: number = 500): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let { width, height } = img;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = (height * MAX_WIDTH) / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = (width * MAX_HEIGHT) / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress image
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Start with high quality and reduce if needed
        let quality = 0.9;
        let result = canvas.toDataURL('image/jpeg', quality);
        
        // Reduce quality until under size limit
        while (result.length > maxSizeKB * 1024 * 1.33 && quality > 0.1) { // 1.33 accounts for base64 overhead
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        
        resolve(result);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, onChange: (value: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please choose an image file.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Show loading state
      toast({
        title: "Processing image",
        description: "Optimizing your image...",
      });

      const resizedImage = await resizeImage(file, 500); // 500KB limit
      onChange(resizedImage);
      
      const sizeKB = Math.round(resizedImage.length / 1024 * 0.75); // Approximate file size
      toast({
        title: "Image uploaded",
        description: `Image optimized and uploaded successfully! (${sizeKB}KB)`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to process the image file.",
        variant: "destructive",
      });
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
        unitsPerPallet: data.unitsPerPallet ? parseInt(data.unitsPerPallet) : null,
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
        unitsPerPallet: productData.unitsPerPallet ? parseInt(productData.unitsPerPallet) : null,
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
    onError: (error: any) => {
      // Check if this is an edit limit error
      if (error.status === 403 && error.message.includes("Product limit reached")) {
        toast({
          title: "Product Edit Limit Reached",
          description: "You've used all 3 product edits. Upgrade your plan to edit more products.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to update product",
          variant: "destructive",
        });
      }
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

  const updateProductStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "active" | "inactive" | "out_of_stock" }) => {
      return await apiRequest("PATCH", `/api/products/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Success",
        description: "Product status updated successfully",
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
      currency: product.currency || user?.preferredCurrency || "GBP",
      moq: product.moq.toString(),
      stock: product.stock.toString(),
      category: product.category || "",
      imageUrl: product.imageUrl || "",
      priceVisible: product.priceVisible,
      negotiationEnabled: product.negotiationEnabled,
      minimumBidPrice: product.minimumBidPrice || "",
      status: product.status,
      unitType: product.unitType || "units",
      unitsPerPallet: product.unitsPerPallet?.toString() || "",
      deliveryOptions: {
        pickup: product.supportsPickup !== false,
        delivery: product.supportsDelivery !== false,
      },
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
      currency: product.currency || user?.preferredCurrency || "GBP",
      moq: product.moq.toString(),
      stock: product.stock.toString(),
      category: product.category || "",
      imageUrl: product.imageUrl || "",
      priceVisible: product.priceVisible,
      negotiationEnabled: product.negotiationEnabled,
      minimumBidPrice: product.minimumBidPrice || "",
      status: product.status,
      unitType: product.unitType || "units",
      unitsPerPallet: product.unitsPerPallet?.toString() || "",
      deliveryOptions: {
        pickup: product.supportsPickup !== false,
        delivery: product.supportsDelivery !== false,
      },
    });
    setIsDialogOpen(true);
  };

  const handleStatusChange = (id: number, status: "active" | "inactive" | "out_of_stock") => {
    console.log("Status change handler called:", id, status);
    updateProductStatusMutation.mutate({ id, status });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = file.name.split('.').pop()?.toLowerCase();
    
    if (fileType === 'csv') {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          processUploadedData(results.data);
        },
        error: (error) => {
          toast({
            title: "Error",
            description: "Failed to parse CSV file: " + error.message,
            variant: "destructive",
          });
        }
      });
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          processUploadedData(jsonData);
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to parse Excel file",
            variant: "destructive",
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({
        title: "Error",
        description: "Please upload a CSV or Excel file",
        variant: "destructive",
      });
    }
  };

  const processUploadedData = (data: any[]) => {
    const errors: string[] = [];
    const validProducts: any[] = [];

    data.forEach((row, index) => {
      const rowNumber = index + 1;
      
      // Required fields validation
      if (!row.name || !row.price || !row.moq || !row.stock) {
        errors.push(`Row ${rowNumber}: Missing required fields (name, price, moq, stock)`);
        return;
      }

      // Validate numeric fields
      if (isNaN(Number(row.price)) || isNaN(Number(row.moq)) || isNaN(Number(row.stock))) {
        errors.push(`Row ${rowNumber}: Price, MOQ, and Stock must be numeric`);
        return;
      }

      // Validate unit type
      if (row.unitType && !['units', 'pallets'].includes(row.unitType)) {
        errors.push(`Row ${rowNumber}: Unit type must be 'units' or 'pallets'`);
        return;
      }

      // Validate status
      if (row.status && !['active', 'inactive', 'out_of_stock'].includes(row.status)) {
        errors.push(`Row ${rowNumber}: Status must be 'active', 'inactive', or 'out_of_stock'`);
        return;
      }

      // Build product object
      const product = {
        name: row.name,
        description: row.description || "",
        price: row.price,
        currency: row.currency || user?.preferredCurrency || "GBP",
        moq: row.moq,
        stock: row.stock,
        category: row.category || "",
        imageUrl: row.imageUrl || "",
        priceVisible: row.priceVisible !== 'false',
        negotiationEnabled: row.negotiationEnabled === 'true',
        minimumBidPrice: row.minimumBidPrice || "",
        status: row.status || "active",
        unitType: row.unitType || "units",
        unitsPerPallet: row.unitsPerPallet || "",
        supportsPickup: row.supportsPickup !== 'false',
        supportsDelivery: row.supportsDelivery !== 'false',
      };

      validProducts.push(product);
    });

    setUploadErrors(errors);
    setUploadedProducts(validProducts);
    setIsBulkUploadDialogOpen(true);
  };

  const bulkCreateProductsMutation = useMutation({
    mutationFn: async (products: any[]) => {
      const results = [];
      for (const product of products) {
        try {
          const productData = {
            ...product,
            price: parseFloat(product.price),
            moq: parseInt(product.moq),
            stock: parseInt(product.stock),
            unitsPerPallet: product.unitsPerPallet ? parseInt(product.unitsPerPallet) : null,
          };
          const result = await apiRequest("POST", "/api/products", productData);
          results.push({ success: true, product: result });
        } catch (error) {
          results.push({ success: false, error: error.message, product: product.name });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      toast({
        title: "Bulk Upload Complete",
        description: `${successCount} products created successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        variant: successCount > 0 ? "default" : "destructive",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      setIsBulkUploadDialogOpen(false);
      setUploadedProducts([]);
      setUploadErrors([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to create products: " + error.message,
        variant: "destructive",
      });
    },
  });

  const downloadTemplate = () => {
    const template = [
      {
        name: "Example Product",
        description: "Product description",
        price: "10.99",
        currency: "GBP",
        moq: "1",
        stock: "100",
        category: "Electronics",
        imageUrl: "",
        priceVisible: "true",
        negotiationEnabled: "false",
        minimumBidPrice: "",
        status: "active",
        unitType: "units",
        unitsPerPallet: "",
        supportsPickup: "true",
        supportsDelivery: "true"
      }
    ];
    
    const csv = Papa.unparse(template);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
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
              <Button 
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
                onClick={() => window.open('/preview-store', '_blank')}
              >
                <Package className="mr-2 h-4 w-4" />
                Preview Store
              </Button>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              
              <Dialog open={isBulkUploadDialogOpen} onOpenChange={setIsBulkUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    Bulk Upload
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Bulk Upload Products</DialogTitle>
                  </DialogHeader>
                  
                  {uploadedProducts.length === 0 ? (
                    <div className="space-y-6">
                      <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <FileText className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">Upload Product File</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Upload a CSV or Excel file with your product data
                        </p>
                        <div className="mt-6">
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="bulk-upload-file"
                          />
                          <label htmlFor="bulk-upload-file">
                            <Button variant="outline" className="cursor-pointer" asChild>
                              <span>
                                <Upload className="mr-2 h-4 w-4" />
                                Choose File
                              </span>
                            </Button>
                          </label>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <h4 className="font-semibold">File Format Requirements:</h4>
                        <div className="text-sm text-gray-600 space-y-2">
                          <p><strong>Required columns:</strong> name, price, moq, stock</p>
                          <p><strong>Optional columns:</strong> description, currency, category, imageUrl, priceVisible, negotiationEnabled, minimumBidPrice, status, unitType, unitsPerPallet, supportsPickup, supportsDelivery</p>
                          <p><strong>Supported formats:</strong> CSV, Excel (.xlsx, .xls)</p>
                        </div>
                        <Button variant="link" onClick={downloadTemplate} className="p-0">
                          Download template file to get started
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {uploadErrors.length > 0 && (
                        <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                          <div className="flex">
                            <AlertCircle className="h-5 w-5 text-red-400" />
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-red-800">Upload Errors</h3>
                              <div className="mt-2 text-sm text-red-700">
                                <ul className="list-disc list-inside space-y-1">
                                  {uploadErrors.map((error, index) => (
                                    <li key={index}>{error}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                        <div className="flex">
                          <CheckCircle className="h-5 w-5 text-green-400" />
                          <div className="ml-3">
                            <h3 className="text-sm font-medium text-green-800">
                              {uploadedProducts.length} Products Ready to Upload
                            </h3>
                          </div>
                        </div>
                      </div>
                      
                      <div className="max-h-64 overflow-y-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">MOQ</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Type</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {uploadedProducts.map((product, index) => (
                              <tr key={index}>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.name}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{formatCurrency(parseFloat(product.price), product.currency)}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.moq}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.stock}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.unitType}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="flex justify-end space-x-3">
                        <Button variant="outline" onClick={() => {
                          setUploadedProducts([]);
                          setUploadErrors([]);
                        }}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => bulkCreateProductsMutation.mutate(uploadedProducts)}
                          disabled={bulkCreateProductsMutation.isPending || uploadedProducts.length === 0}
                        >
                          {bulkCreateProductsMutation.isPending ? "Creating..." : `Create ${uploadedProducts.length} Products`}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingProduct(null);
                    form.reset({
                      name: "",
                      description: "",
                      price: "",
                      currency: user?.preferredCurrency || "GBP",
                      moq: "1",
                      stock: "0",
                      category: "",
                      imageUrl: "",
                      priceVisible: true,
                      negotiationEnabled: false,
                      minimumBidPrice: "",
                      status: "active",
                      unitType: "units",
                      unitsPerPallet: "",
                      deliveryOptions: {
                        pickup: true,
                        delivery: true,
                      },
                    });
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
                            <FormLabel>Product Image</FormLabel>
                            <FormControl>
                              <div className="space-y-4">
                                <div className="flex space-x-2">
                                  <Input 
                                    placeholder="Enter image URL or upload file" 
                                    {...field} 
                                    className="flex-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => document.getElementById('image-upload')?.click()}
                                    className="px-3"
                                  >
                                    <Upload className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                <input
                                  id="image-upload"
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleImageUpload(e, field.onChange)}
                                  className="hidden"
                                />
                                
                                {field.value && (
                                  <div className="flex items-center space-x-4">
                                    <img 
                                      src={field.value} 
                                      alt="Product preview" 
                                      className="h-20 w-20 object-cover rounded-lg border"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => field.onChange("")}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                )}
                                
                                <p className="text-sm text-gray-600">
                                  Upload an image file or paste an image URL. Images are automatically optimized for best performance.
                                </p>
                              </div>
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
                        
                        <FormField
                          control={form.control}
                          name="unitType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Unit Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select unit type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="units">Individual Units</SelectItem>
                                  <SelectItem value="pallets">Pallets</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {form.watch("unitType") === "pallets" && (
                        <FormField
                          control={form.control}
                          name="unitsPerPallet"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Units per Pallet</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="e.g., 48" {...field} />
                              </FormControl>
                              <FormMessage />
                              <div className="text-sm text-muted-foreground">
                                How many individual units are included in one pallet
                              </div>
                            </FormItem>
                          )}
                        />
                      )}

                      <div className="space-y-4">
                        <div>
                          <FormLabel className="text-base">Fulfillment Options</FormLabel>
                          <div className="text-sm text-muted-foreground mb-3">
                            Choose which delivery options customers can select
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="deliveryOptions.pickup"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Customer Pickup</FormLabel>
                                  <div className="text-sm text-muted-foreground">
                                    Customers can collect orders from your location
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
                            name="deliveryOptions.delivery"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Delivery Available</FormLabel>
                                  <div className="text-sm text-muted-foreground">
                                    Offer delivery through courier services
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
                          {form.watch("negotiationEnabled") && (
                            <FormField
                              control={form.control}
                              name="minimumBidPrice"
                              render={({ field }) => (
                                <FormItem className="rounded-lg border p-4">
                                  <div className="space-y-2">
                                    <FormLabel className="text-base">Minimum Bid Price</FormLabel>
                                    <div className="text-sm text-muted-foreground">
                                      Set the lowest price you'll accept for negotiations. Bids below this amount will be automatically declined.
                                    </div>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="e.g., 15.00"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </div>
                                </FormItem>
                              )}
                            />
                          )}
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
            <ProductGridSkeleton count={8} />
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product: any) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onStatusChange={handleStatusChange}
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
                            <div className="font-semibold">{formatNumber(product.moq)} units</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Stock:</span>
                            <div className={`font-semibold ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {formatNumber(product.stock)} units
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
                  <Button onClick={() => {
                    setEditingProduct(null);
                    form.reset({
                      name: "",
                      description: "",
                      price: "",
                      currency: user?.preferredCurrency || "GBP",
                      moq: "1",
                      stock: "0",
                      category: "",
                      imageUrl: "",
                      priceVisible: true,
                      negotiationEnabled: false,
                      minimumBidPrice: "",
                      status: "active",
                      unitType: "units",
                      unitsPerPallet: "",
                      deliveryOptions: {
                        pickup: true,
                        delivery: true,
                      },
                    });
                    setIsDialogOpen(true);
                  }}>
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
