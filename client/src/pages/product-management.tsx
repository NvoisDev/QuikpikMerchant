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
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";
import { useSubscription } from "@/hooks/useSubscription";
import { PromotionAnalytics } from "@/components/PromotionAnalytics";
import { Plus, Search, Download, Grid, List, Package, Upload, Sparkles, FileText, AlertCircle, CheckCircle, AlertTriangle, Bell } from "lucide-react";
import type { Product } from "@shared/schema";
import { currencies, formatCurrency } from "@/lib/currencies";
import { UNITS, COMMON_WHOLESALE_FORMATS, formatUnitDisplay, BASE_UNITS } from "@shared/units";
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
  promoPrice: z.string().optional(),
  promoActive: z.boolean(),
  currency: z.string().min(1, "Currency is required"),
  moq: z.string().min(1, "MOQ is required"),
  stock: z.string().min(1, "Stock is required"),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  images: z.array(z.string()).optional(),
  priceVisible: z.boolean(),
  negotiationEnabled: z.boolean(),
  minimumBidPrice: z.string().optional(),
  status: z.enum(["active", "inactive", "out_of_stock"]),
  
  // Flexible unit system
  packQuantity: z.string().optional(),
  unitOfMeasure: z.string().optional(), 
  unitSize: z.string().optional(),
  
  // Weight and shipping requirements  
  unitWeight: z.string().optional(),
  totalPackageWeight: z.string().optional(),
  
  // Delivery exclusion
  deliveryExcluded: z.boolean().optional(),
  temperatureRequirement: z.enum(["ambient", "chilled", "frozen"]).optional(),
  contentCategory: z.enum(["general", "food", "pharmaceuticals", "electronics", "textiles"]).optional(),
  specialHandling: z.object({
    fragile: z.boolean().optional(),
    perishable: z.boolean().optional(),
    hazardous: z.boolean().optional(),
  }).optional(),
  

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
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"product_limit" | "edit_limit" | "general">("general");
  
  const { canCreateProduct, canEditProduct, currentTier } = useSubscription();

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      promoPrice: "",
      promoActive: false,
      currency: user?.preferredCurrency || "GBP",
      moq: "1",
      stock: "0",
      category: "",
      imageUrl: "",
      images: [],
      priceVisible: true,
      negotiationEnabled: false,
      minimumBidPrice: "",
      status: "active",
      // Flexible unit system defaults
      packQuantity: "",
      unitOfMeasure: "",
      unitSize: "",
      unitWeight: "",
      totalPackageWeight: "",
      deliveryExcluded: false,
      temperatureRequirement: "ambient",
      contentCategory: "general",
      specialHandling: {
        fragile: false,
        perishable: false,
        hazardous: false,
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
      console.error("Single image upload error:", error);
      toast({
        title: "Upload failed",
        description: `Failed to process image file: ${error.message || "Unknown error"}`,
        variant: "destructive",
      });
    }
  };

  const handleMultipleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, currentImages: string[], onChange: (value: string[]) => void) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Check if adding these files would exceed the 5-image limit
    if (currentImages.length + files.length > 5) {
      toast({
        title: "Too many images",
        description: `You can only upload up to 5 images total. You currently have ${currentImages.length} images.`,
        variant: "destructive",
      });
      return;
    }

    // Check file types
    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast({
        title: "Invalid file type",
        description: "Please choose only image files.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Show loading state
      toast({
        title: "Processing images",
        description: `Optimizing ${files.length} image(s)...`,
      });

      const processedImages = await Promise.all(
        files.map(file => resizeImage(file, 500))
      );

      const updatedImages = [...currentImages, ...processedImages];
      onChange(updatedImages);
      
      toast({
        title: "Images uploaded",
        description: `${files.length} image(s) optimized and uploaded successfully!`,
      });
    } catch (error) {
      console.error("Image upload error:", error);
      toast({
        title: "Upload failed",
        description: `Failed to process image files: ${error.message || "Unknown error"}`,
        variant: "destructive",
      });
    }
  };

  const removeImage = (imageIndex: number, currentImages: string[], onChange: (value: string[]) => void) => {
    const updatedImages = currentImages.filter((_, index) => index !== imageIndex);
    onChange(updatedImages);
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

  // Fetch stock alerts count
  const { data: alertsData } = useQuery({
    queryKey: ['/api/stock-alerts/count'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const productData = {
        ...data,
        price: parseFloat(data.price),
        promoPrice: data.promoPrice ? parseFloat(data.promoPrice) : null,
        moq: parseInt(data.moq),
        stock: parseInt(data.stock),
        unitsPerPallet: data.unitsPerPallet ? parseInt(data.unitsPerPallet) : null,
        palletPrice: data.palletPrice ? parseFloat(data.palletPrice) : null,
        palletMoq: data.palletMoq ? parseInt(data.palletMoq) : 1,
        palletStock: data.palletStock ? parseInt(data.palletStock) : 0,
        // Weight and shipping fields
        unitWeight: data.unitWeight || null,
        palletWeight: data.palletWeight || null,
        lowStockThreshold: data.lowStockThreshold ? parseInt(data.lowStockThreshold) : 50,
        shelfLife: data.shelfLife ? parseInt(data.shelfLife) : null,
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
        promoPrice: productData.promoPrice ? parseFloat(productData.promoPrice) : null,
        moq: parseInt(productData.moq),
        stock: parseInt(productData.stock),
        unitsPerPallet: productData.unitsPerPallet ? parseInt(productData.unitsPerPallet) : null,
        palletPrice: productData.palletPrice ? parseFloat(productData.palletPrice) : null,
        palletMoq: productData.palletMoq ? parseInt(productData.palletMoq) : 1,
        palletStock: productData.palletStock ? parseInt(productData.palletStock) : 0,
        // Weight and shipping fields
        unitWeight: productData.unitWeight || null,
        palletWeight: productData.palletWeight || null,
        lowStockThreshold: productData.lowStockThreshold ? parseInt(productData.lowStockThreshold) : 50,
        shelfLife: productData.shelfLife ? parseInt(productData.shelfLife) : null,
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
    // Check if user can edit this product based on edit count and subscription
    if (!canEditProduct(product.editCount || 0)) {
      setUpgradeReason("edit_limit");
      setUpgradeModalOpen(true);
      return;
    }
    
    setEditingProduct(product);
    form.reset({
      name: product.name,
      description: product.description || "",
      price: product.price.toString(),
      promoPrice: product.promoPrice?.toString() || "",
      promoActive: product.promoActive || false,
      currency: product.currency || user?.preferredCurrency || "GBP",
      moq: product.moq.toString(),
      stock: product.stock.toString(),
      category: product.category || "",
      imageUrl: product.imageUrl || "",
      images: product.images || [],
      priceVisible: product.priceVisible,
      negotiationEnabled: product.negotiationEnabled,
      minimumBidPrice: product.minimumBidPrice || "",
      status: product.status,
      // Flexible unit system
      packQuantity: product.packQuantity?.toString() || "",
      unitOfMeasure: product.unitOfMeasure || "",
      unitSize: product.unitSize?.toString() || "",
      // Weight and shipping fields
      unitWeight: product.unitWeight?.toString() || "",
      totalPackageWeight: product.totalPackageWeight?.toString() || "",
      deliveryExcluded: product.deliveryExcluded || false,
      temperatureRequirement: product.temperatureRequirement || "ambient",
      contentCategory: product.contentCategory || "general",
      specialHandling: product.specialHandling || {},
      shelfLife: product.shelfLife?.toString() || "",
      lowStockThreshold: product.lowStockThreshold?.toString() || "50",
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
      promoPrice: product.promoPrice?.toString() || "",
      promoActive: product.promoActive || false,
      currency: product.currency || user?.preferredCurrency || "GBP",
      moq: product.moq.toString(),
      stock: product.stock.toString(),
      category: product.category || "",
      imageUrl: product.imageUrl || "",
      images: product.images || [],
      priceVisible: product.priceVisible,
      negotiationEnabled: product.negotiationEnabled,
      minimumBidPrice: product.minimumBidPrice || "",
      status: product.status,
      // Flexible unit system
      packQuantity: product.packQuantity?.toString() || "",
      unitOfMeasure: product.unitOfMeasure || "",
      unitSize: product.unitSize?.toString() || "",
      // Weight and shipping fields
      unitWeight: product.unitWeight?.toString() || "",
      totalPackageWeight: product.totalPackageWeight?.toString() || "",
      deliveryExcluded: product.deliveryExcluded || false,
      temperatureRequirement: product.temperatureRequirement || "ambient",
      contentCategory: product.contentCategory || "general",
      specialHandling: product.specialHandling || {},
      shelfLife: product.shelfLife?.toString() || "",
      lowStockThreshold: product.lowStockThreshold?.toString() || "50",
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

      // Validate unit (optional)
      if (row.unit) {
        const validUnits = UNITS.map(unit => unit.value);
        if (!validUnits.includes(row.unit)) {
          errors.push(`Row ${rowNumber}: Invalid unit '${row.unit}'. See template for valid units.`);
          return;
        }
      }

      // Validate status
      if (row.status && !['active', 'inactive', 'out_of_stock'].includes(row.status)) {
        errors.push(`Row ${rowNumber}: Status must be 'active', 'inactive', or 'out_of_stock'`);
        return;
      }

      // Build product object with enhanced shipping information
      const product = {
        name: row.name,
        description: row.description || "",
        price: row.price,
        promoPrice: row.promoPrice || "",
        promoActive: row.promoActive === 'true',
        currency: row.currency || user?.preferredCurrency || "GBP",
        moq: row.moq,
        stock: row.stock,
        category: row.category || "",
        imageUrl: row.imageUrl || "",
        priceVisible: row.priceVisible !== 'false',
        negotiationEnabled: row.negotiationEnabled === 'true',
        minimumBidPrice: row.minimumBidPrice || "",
        status: row.status || "active",
        unit: row.unit || "units",
        unitFormat: row.unitFormat || "none",
        sellingFormat: row.sellingFormat || "units",
        unitsPerPallet: row.unitsPerPallet || "",
        palletPrice: row.palletPrice || "",
        palletMoq: row.palletMoq || "",
        palletStock: row.palletStock || "",
        unitWeight: row.unitWeight || "",
        palletWeight: row.palletWeight || "",
        temperatureRequirement: row.temperatureRequirement || "ambient",
        contentCategory: row.contentCategory || "general",
        specialHandling: {
          fragile: row.specialHandling_fragile === 'true',
          perishable: row.specialHandling_perishable === 'true',
          hazardous: row.specialHandling_hazardous === 'true',
        },
        deliveryOptions: {
          pickup: row.deliveryOptions_pickup !== 'false',
          delivery: row.deliveryOptions_delivery !== 'false',
        },
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
            promoPrice: product.promoPrice ? parseFloat(product.promoPrice) : null,
            moq: parseInt(product.moq),
            stock: parseInt(product.stock),
            minimumBidPrice: product.minimumBidPrice ? parseFloat(product.minimumBidPrice) : null,
            unitsPerPallet: product.unitsPerPallet ? parseInt(product.unitsPerPallet) : null,
            palletPrice: product.palletPrice ? parseFloat(product.palletPrice) : null,
            palletMoq: product.palletMoq ? parseInt(product.palletMoq) : null,
            palletStock: product.palletStock ? parseInt(product.palletStock) : null,
            unit: product.unit || "units",
            unitFormat: product.unitFormat === "" ? "none" : (product.unitFormat || "none"),
            unitWeight: product.unitWeight || null,
            palletWeight: product.palletWeight || null,
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
        name: "Example Product 1",
        description: "Premium Basmati Rice for wholesale",
        price: "25.99",
        promoPrice: "22.99",
        promoActive: "false",
        currency: "GBP",
        moq: "10",
        stock: "500",
        category: "Groceries & Food",
        imageUrl: "",
        priceVisible: "true",
        negotiationEnabled: "false",
        minimumBidPrice: "",
        status: "active",
        unit: "kg",
        unitFormat: "25kg bags",
        sellingFormat: "units",
        unitsPerPallet: "40",
        palletPrice: "950.00",
        palletMoq: "1",
        palletStock: "5",
        unitWeight: "25",
        palletWeight: "1000",
        temperatureRequirement: "ambient",
        contentCategory: "food",
        specialHandling_fragile: "false",
        specialHandling_perishable: "false",
        specialHandling_hazardous: "false",
        deliveryOptions_pickup: "true",
        deliveryOptions_delivery: "true"
      },
      {
        name: "Example Product 2",
        description: "Premium olive oil bottles",
        price: "8.50",
        promoPrice: "",
        promoActive: "false",
        currency: "GBP",
        moq: "12",
        stock: "240",
        category: "Groceries & Food",
        imageUrl: "",
        priceVisible: "true",
        negotiationEnabled: "true",
        minimumBidPrice: "7.00",
        status: "active",
        unit: "ml",
        unitFormat: "12 x 500ml",
        sellingFormat: "units",
        unitsPerPallet: "120",
        palletPrice: "850.00",
        palletMoq: "1",
        palletStock: "2",
        unitWeight: "0.5",
        palletWeight: "60",
        temperatureRequirement: "ambient",
        contentCategory: "food",
        specialHandling_fragile: "false",
        specialHandling_perishable: "false",
        specialHandling_hazardous: "false",
        deliveryOptions_pickup: "true",
        deliveryOptions_delivery: "true"
      },
      {
        name: "Example Product 3",
        description: "Energy drink cans",
        price: "1.25",
        promoPrice: "1.10",
        promoActive: "true",
        currency: "GBP",
        moq: "24",
        stock: "1200",
        category: "Beverages & Drinks",
        imageUrl: "",
        priceVisible: "true",
        negotiationEnabled: "false",
        minimumBidPrice: "",
        status: "active",
        unit: "cl",
        unitFormat: "24 x 33cl",
        sellingFormat: "units",
        unitsPerPallet: "480",
        palletPrice: "600.00",
        palletMoq: "1",
        palletStock: "3",
        unitWeight: "0.35",
        palletWeight: "168",
        temperatureRequirement: "ambient",
        contentCategory: "food",
        specialHandling_fragile: "false",
        specialHandling_perishable: "false",
        specialHandling_hazardous: "false",
        deliveryOptions_pickup: "true",
        deliveryOptions_delivery: "true"
      }
    ];
    
    const csv = Papa.unparse(template);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template_with_units.csv';
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
          <div className="space-y-4">
            {/* Header Section */}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">Product Management</h1>
                <ContextualHelpBubble
                  topic="product management"
                  title="Managing Your Products"
                  steps={helpContent.productManagement.steps}
                  position="right"
                />
              </div>
              <p className="text-gray-600 mt-1">Manage your inventory, pricing, and product details.</p>
            </div>
            
            {/* Action Buttons Section */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button 
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700"
                  onClick={() => window.open('/preview-store', '_blank')}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Preview Store
                </Button>
                
                <Button 
                  variant="outline" 
                  className={alertsData?.count > 0 ? "border-red-500 text-red-600 hover:bg-red-50" : "border-gray-300 text-gray-600 hover:bg-gray-50"}
                  onClick={() => window.location.href = '/stock-alerts'}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Stock Alerts
                  {alertsData?.count > 0 && (
                    <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                      {alertsData.count}
                    </Badge>
                  )}
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
                          <p><strong>Optional columns:</strong> description, promoPrice, promoActive, currency, category, imageUrl, priceVisible, negotiationEnabled, minimumBidPrice, status, unit, unitFormat, sellingFormat, unitsPerPallet, palletPrice, palletMoq, palletStock, unitWeight, palletWeight, temperatureRequirement, contentCategory, supportsPickup, supportsDelivery</p>
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
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {uploadedProducts.map((product, index) => (
                              <tr key={index}>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.name}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{formatCurrency(parseFloat(product.price), product.currency)}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.moq}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.stock}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{product.unit || 'units'} {product.unitFormat && `(${product.unitFormat})`}</td>
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
              </div>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingProduct(null);
                    form.reset({
                      name: "",
                      description: "",
                      price: "",
                      promoPrice: "",
                      promoActive: false,
                      currency: user?.preferredCurrency || "GBP",
                      moq: "1",
                      stock: "0",
                      category: "",
                      imageUrl: "",
                      priceVisible: true,
                      negotiationEnabled: false,
                      minimumBidPrice: "",
                      status: "active",
                      unit: "units",
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
                              <FormLabel>Regular Price</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="promoPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Promo Price</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                              </FormControl>
                              <FormMessage />
                              <div className="text-xs text-muted-foreground">
                                Optional promotional price
                              </div>
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
                        name="images"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Product Images</FormLabel>
                            <FormControl>
                              <div className="space-y-4">
                                <div className="flex space-x-2">
                                  <Input 
                                    placeholder="Enter image URL and press Enter" 
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const input = e.target as HTMLInputElement;
                                        const url = input.value.trim();
                                        if (url && (field.value?.length || 0) < 5) {
                                          const currentImages = field.value || [];
                                          field.onChange([...currentImages, url]);
                                          input.value = '';
                                        } else if ((field.value?.length || 0) >= 5) {
                                          toast({
                                            title: "Maximum images reached",
                                            description: "You can only have up to 5 images per product.",
                                            variant: "destructive",
                                          });
                                        }
                                      }
                                    }}
                                    className="flex-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => document.getElementById('multiple-image-upload')?.click()}
                                    className="px-3"
                                    disabled={(field.value?.length || 0) >= 5}
                                  >
                                    <Upload className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                <input
                                  id="multiple-image-upload"
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => handleMultipleImageUpload(e, field.value || [], field.onChange)}
                                  className="hidden"
                                />
                                
                                {field.value && field.value.length > 0 && (
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {field.value.map((imageUrl: string, index: number) => (
                                      <div key={index} className="relative group">
                                        <img 
                                          src={imageUrl} 
                                          alt={`Product image ${index + 1}`} 
                                          className="h-20 w-20 object-cover rounded-lg border"
                                        />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeImage(index, field.value || [], field.onChange)}
                                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          ×
                                        </Button>
                                        {index === 0 && (
                                          <Badge className="absolute -bottom-2 left-0 text-xs bg-blue-500">
                                            Primary
                                          </Badge>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                <p className="text-sm text-gray-600">
                                  Upload up to 5 images or paste image URLs. First image will be the primary display image. Images are automatically optimized.
                                </p>
                                
                                {(field.value?.length || 0) > 0 && (
                                  <p className="text-sm text-blue-600">
                                    {field.value?.length || 0}/5 images uploaded
                                  </p>
                                )}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Flexible Unit Configuration Section */}
                      <div className="space-y-4">
                        <div>
                          <FormLabel className="text-base">Product Unit Configuration</FormLabel>
                          <div className="text-sm text-muted-foreground mb-3">
                            Configure how your product is packaged and measured for accurate shipping calculations
                          </div>
                        </div>
                        
                        {/* New Flexible Unit System */}
                        <div className="space-y-4 border rounded-lg p-4 bg-blue-50">
                          <div className="flex items-center space-x-2">
                            <Package className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-700">Flexible Unit Configuration</span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField
                              control={form.control}
                              name="packQuantity"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Quantity in Pack</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="e.g., 24"
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-xs text-muted-foreground">
                                    Number per pack (optional)
                                  </div>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="unitOfMeasure"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Unit of Measure</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select unit" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {["Weight", "Volume", "Count", "Packaging"].map((category) => (
                                        <div key={category}>
                                          <div className="px-2 py-1 text-xs font-medium text-muted-foreground bg-muted">
                                            {category}
                                          </div>
                                          {BASE_UNITS.filter(unit => unit.category === category).map((unit) => (
                                            <SelectItem key={unit.value} value={unit.value}>
                                              {unit.label}
                                            </SelectItem>
                                          ))}
                                        </div>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                  <div className="text-xs text-muted-foreground">
                                    Base unit (ml, g, pieces, etc.)
                                  </div>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="unitSize"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Size per Unit</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.001"
                                      placeholder="e.g., 250"
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-xs text-muted-foreground">
                                    Size/weight per unit
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="bg-blue-100 p-3 rounded-lg">
                            <p className="text-sm text-blue-700">
                              <strong>Example:</strong> For "24 x 250ml cans", enter: Quantity = 24, Unit = ml, Size = 250
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                              This replaces the need for predefined formats and allows any combination
                            </p>
                          </div>
                        </div>
                      </div>

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
                          name="deliveryExcluded"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={field.onChange}
                                  className="mt-1"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Exclude from Delivery</FormLabel>
                                <div className="text-sm text-muted-foreground">
                                  Check if this product should only be available for pickup
                                </div>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>

                      {(form.watch("sellingFormat") === "pallets" || form.watch("sellingFormat") === "both") && (
                        <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                          <div className="font-medium text-sm">Pallet Configuration</div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            
                            <FormField
                              control={form.control}
                              name="palletPrice"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Price per Pallet ({user?.preferredCurrency || "GBP"})</FormLabel>
                                  <FormControl>
                                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-sm text-muted-foreground">
                                    Price for one complete pallet
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="palletMoq"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Minimum Pallet Order</FormLabel>
                                  <FormControl>
                                    <Input type="number" placeholder="1" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-sm text-muted-foreground">
                                    Minimum pallets per order
                                  </div>
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="palletStock"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Pallets in Stock</FormLabel>
                                  <FormControl>
                                    <Input type="number" placeholder="0" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-sm text-muted-foreground">
                                    Number of pallets available
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      )}

                      {/* Weight and Shipping Requirements Section */}
                      <div className="space-y-4 border rounded-lg p-4 bg-blue-50">
                        <div>
                          <FormLabel className="text-base font-semibold">📦 Weight & Shipping Information</FormLabel>
                          <div className="text-sm text-muted-foreground mb-3">
                            Required for accurate shipping quotes and carrier selection
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="unitWeight"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Unit Weight (kg)</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.001" placeholder="0.500" {...field} />
                                </FormControl>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  Weight per individual unit
                                </div>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="totalPackageWeight"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Total Package Weight (kg)</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.001" placeholder="Auto-calculated" {...field} />
                                </FormControl>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  Complete package weight for shipping quotes
                                </div>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="temperatureRequirement"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Temperature Requirement</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select requirement" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="ambient">🌡️ Ambient (Room Temperature)</SelectItem>
                                    <SelectItem value="chilled">🧊 Chilled (0°C to +4°C)</SelectItem>
                                    <SelectItem value="frozen">❄️ Frozen (-18°C to -25°C)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  Required temperature for delivery
                                </div>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="contentCategory"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Content Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="general">📦 General</SelectItem>
                                    <SelectItem value="food">🍕 Food & Beverages</SelectItem>
                                    <SelectItem value="pharmaceuticals">💊 Pharmaceuticals</SelectItem>
                                    <SelectItem value="electronics">📱 Electronics</SelectItem>
                                    <SelectItem value="textiles">👕 Textiles</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  Product type for shipping requirements
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                        

                        
                        <div>
                          <FormLabel className="text-sm font-medium">Special Handling Requirements</FormLabel>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                            <FormField
                              control={form.control}
                              name="specialHandling.fragile"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <input
                                      type="checkbox"
                                      checked={field.value || false}
                                      onChange={(e) => field.onChange(e.target.checked)}
                                      className="rounded border"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm">
                                    📦 Fragile
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="specialHandling.perishable"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <input
                                      type="checkbox"
                                      checked={field.value || false}
                                      onChange={(e) => field.onChange(e.target.checked)}
                                      className="rounded border"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm">
                                    ⏰ Perishable
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="specialHandling.hazardous"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <input
                                      type="checkbox"
                                      checked={field.value || false}
                                      onChange={(e) => field.onChange(e.target.checked)}
                                      className="rounded border"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm">
                                    ⚠️ Hazardous
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>



                      <div className="flex items-center justify-between">
                        <div className="space-y-4">
                          {/* Price visibility toggle removed - marketplace-specific pricing controls are in subscription settings for Premium users */}
                          
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
                          
                          <FormField
                            control={form.control}
                            name="promoActive"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Promotional Pricing Active</FormLabel>
                                  <div className="text-sm text-muted-foreground">
                                    Use promotional price instead of regular price
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
                <div key={product.id} className="space-y-3">
                  <ProductCard
                    product={product}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onStatusChange={handleStatusChange}
                  />
                  <PromotionAnalytics productId={product.id} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProducts.map((product: any) => (
                <div key={product.id} className="space-y-3">
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-6">
                        <img 
                          src={
                            (product.images && product.images.length > 0) 
                              ? product.images[0] 
                              : product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100"
                          } 
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
                                {product.priceVisible ? (
                                  <div className="flex items-center gap-2">
                                    {product.promoActive && product.promoPrice ? (
                                      <>
                                        <span className="text-green-600">
                                          {formatCurrency(parseFloat(product.promoPrice), product.currency || "GBP")}
                                        </span>
                                        <span className="text-gray-500 line-through text-sm">
                                          {formatCurrency(parseFloat(product.price), product.currency || "GBP")}
                                        </span>
                                        <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                                          PROMO
                                        </Badge>
                                      </>
                                    ) : (
                                      formatCurrency(parseFloat(product.price), product.currency || "GBP")
                                    )}
                                  </div>
                                ) : "Hidden"}
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
                  <PromotionAnalytics productId={product.id} />
                </div>
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
                      promoPrice: "",
                      promoActive: false,
                      currency: user?.preferredCurrency || "GBP",
                      moq: "1",
                      stock: "0",
                      category: "",
                      imageUrl: "",
                      priceVisible: true,
                      negotiationEnabled: false,
                      minimumBidPrice: "",
                      status: "active",
                      unit: "units",
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

      {/* Subscription Upgrade Modal */}
      <SubscriptionUpgradeModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        reason={upgradeReason}
        currentPlan={currentTier}
      />
    </div>
  );
}
