import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AuthUser } from "@/hooks/useAuth";

import ProductCard from "@/components/product-card";
import { ProductGridSkeleton } from "@/components/ui/loading-skeletons";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { Plus, Search, Download, Grid, List, Package, Upload, Sparkles, FileText, AlertCircle, CheckCircle, AlertTriangle, Bell, MoreHorizontal, Pencil, Copy, Trash2, PackagePlus, ArrowUpCircle, ArrowDownCircle, Clock, ToggleLeft, ToggleRight, Lock, LockOpen, Tag } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Product, PromotionalOffer } from "@shared/schema";
import { currencies, formatCurrency } from "@/lib/currencies";
import { useCurrency } from "@/hooks/useCurrency";
import { UNITS, COMMON_WHOLESALE_FORMATS, formatUnitDisplay, BASE_UNITS } from "@shared/units";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import ElephantLoader from "@/components/ui/elephant-loader";
import ButtonLoader from "@/components/ui/button-loader";
import { DynamicTooltip, HelpTooltip, WarningTooltip, FeatureTooltip } from "@/components/ui/dynamic-tooltip";
import { AnimatedButton } from "@/components/ui/animated-button";
import { ContextualHelp, QuickHelp } from "@/components/ui/contextual-help";
import { WhimsicalError, NetworkError, DatabaseError } from "@/components/ui/whimsical-error";
import PageHeader from "@/components/PageHeader";
import { FloatingHelp } from "@/components/ui/floating-help";
import { SubscriptionUpgradeModal } from "@/components/subscription/SubscriptionUpgradeModal";
import { useSidebarContext } from "@/contexts/sidebar-context";

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
  description: z.string().optional().refine(
    (val) => !val || val.length <= 100,
    { message: "Description must be 100 characters or less" }
  ),
  price: z.string().min(1, "Price is required"),
  currency: z.string().min(1, "Currency is required"),
  moq: z.string().min(1, "MOQ is required"),
  stock: z.string().min(1, "Stock is required"),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  images: z.array(z.string()).optional(),
  priceVisible: z.boolean(),
  status: z.enum(["active", "inactive", "out_of_stock"]),
  
  // Flexible unit system
  packQuantity: z.union([z.string(), z.number()]).optional().transform((val) => val ? val.toString() : undefined),
  unitOfMeasure: z.string().optional(), 
  unitSize: z.union([z.string(), z.number()]).optional().transform((val) => val ? val.toString() : undefined),
  
  // Weight and shipping requirements  

  totalPackageWeight: z.union([z.string(), z.number()]).optional().transform((val) => val ? val.toString() : undefined),
  
  // Additional missing fields
  sellingFormat: z.enum(["units", "pallets", "both"]).optional(),
  unitsPerPallet: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  palletPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  palletMoq: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  palletStock: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  palletWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  unitWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  lowStockThreshold: z.string().optional(),
  shelfLife: z.string().optional(),
  expiryDate: z.string().optional(),
  unit: z.string().optional(),
  
  // Delivery exclusion
  deliveryExcluded: z.boolean().optional(),
  temperatureRequirement: z.enum(["ambient", "chilled", "frozen"]).optional(),
  contentCategory: z.enum(["general", "food", "pharmaceuticals", "electronics", "textiles"]).optional(),
  specialHandling: z.object({
    fragile: z.boolean().optional(),
    perishable: z.boolean().optional(),
    hazardous: z.boolean().optional(),
  }).optional(),
  
  // Promotional offers
  promotionalOffers: z.array(z.any()).optional(),

  // Cost price for margin calculations (wholesaler internal)
  costPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
});

type ProductFormData = z.infer<typeof productFormSchema>;

export default function ProductManagement() {
  const { formatMoney } = useCurrency();
  const { user } = useAuth();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const [, navigate] = useLocation();
  const { setMobileTopBarActions } = useSidebarContext();
  
  // SECURITY FIX: Removed hardcoded mock user to prevent data isolation bugs
  // Users must be properly authenticated to access any data
  const effectiveUser = user;
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("productsViewMode");
    return saved === "grid" || saved === "list" ? saved : "grid";
  });
  const handleSetViewMode = (mode: "grid" | "list") => {
    localStorage.setItem("productsViewMode", mode);
    setViewMode(mode);
  };
  const [openMenuProductId, setOpenMenuProductId] = useState<number | null>(null);
  const [marginSort, setMarginSort] = useState<"none" | "asc" | "desc">(() => {
    const saved = localStorage.getItem("productsMarginSort");
    return saved === "asc" || saved === "desc" ? saved : "none";
  });
  const handleSetMarginSort = (value: "none" | "asc" | "desc") => {
    localStorage.setItem("productsMarginSort", value);
    setMarginSort(value);
  };
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [navigateBackTo, setNavigateBackTo] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isBulkUploadDialogOpen, setIsBulkUploadDialogOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<any>(null);
  const [stockAdjustmentType, setStockAdjustmentType] = useState<"increase" | "decrease">("increase");
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [batchExpiry, setBatchExpiry] = useState("");
  const [batchRef, setBatchRef] = useState("");
  const [batchCostPrice, setBatchCostPrice] = useState("");
  const [expandedBatchProductId, setExpandedBatchProductId] = useState<number | null>(null);
  const [editingExpiryBatchId, setEditingExpiryBatchId] = useState<number | null>(null);
  const [editingExpiryValue, setEditingExpiryValue] = useState<string>("");
  const expiryEditCancelledRef = useRef(false);
  // Tracks the last value we auto-filled into unitWeight so we can allow subsequent
  // auto-fills without trampling over a value the user manually typed
  const lastAutoFilledUnitWeight = useRef('');
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [topUpBatchId, setTopUpBatchId] = useState<number | null>(null);
  const [topUpQuantity, setTopUpQuantity] = useState("");
  const [uploadedProducts, setUploadedProducts] = useState<any[]>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  
  // Subscription system removed - defaulting to premium access
  const canCreateProduct = true;
  
  // Create a custom canEditProduct that requires proper authentication
  const canEditProduct = (editCount: number) => {
    // SECURITY FIX: Only authenticated users can edit products
    if (!user) {
      return false;
    }
    
    // Premium access - unlimited edits always allowed
    return true;
  };

  // Auto-calculation for total package weight
  const calculateTotalPackageWeight = useCallback((packQuantity: string, unitOfMeasure: string, unitSize: string): number => {
    const quantity = parseFloat(packQuantity) || 0;
    const size = parseFloat(unitSize) || 0;
    
    if (quantity <= 0 || size <= 0 || !unitOfMeasure) {
      return 0;
    }

    let weightInKg = 0;

    switch (unitOfMeasure.toLowerCase()) {
      case 'g':
      case 'grams':
        weightInKg = (quantity * size) / 1000;
        break;
        
      case 'kg':
      case 'kilograms':
        weightInKg = quantity * size;
        break;
        
      case 'ml':
      case 'millilitres':
        weightInKg = (quantity * size) / 1000;
        break;
        
      case 'l':
      case 'litres':
        weightInKg = quantity * size;
        break;
        
      case 'cl':
      case 'centilitres':
        weightInKg = (quantity * size) / 100;
        break;
        
      case 'pieces':
      case 'units':
      case 'cans':
      case 'bottles':
        weightInKg = quantity * 0.1; // Estimate 100g per unit
        break;
        
      default:
        weightInKg = quantity * 0.1;
    }

    return Math.round(weightInKg * 1000) / 1000;
  }, []);

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
      images: [],
      priceVisible: true,
      status: "active",
      // Flexible unit system defaults
      packQuantity: "",
      unitOfMeasure: "",
      unitSize: "",

      totalPackageWeight: "",
      // Additional fields
      unitsPerPallet: "",
      palletPrice: "",
      palletMoq: "",
      palletStock: "",
      palletWeight: "",
      unitWeight: "",
      lowStockThreshold: String(user?.defaultLowStockThreshold || 50),
      shelfLife: "",
      expiryDate: "",
      unit: "units",
      sellingFormat: "units" as "units" | "pallets" | "both",
      deliveryExcluded: false,
      temperatureRequirement: "ambient",
      contentCategory: "general",
      specialHandling: {
        fragile: false,
        perishable: false,
        hazardous: false,
      },
      promotionalOffers: [],
      costPrice: "",
    },
  });

  // Load product data into form when editing (prevents stack overflow)
  useEffect(() => {
    if (isDialogOpen && editingProduct) {
      console.log('🔄 Loading product data into form safely', editingProduct);
      // Use setTimeout to avoid race conditions
      setTimeout(() => {
        try {
          const safeData = {
            name: editingProduct.name || "",
            description: editingProduct.description || "",
            price: String(editingProduct.price || ""),
            currency: editingProduct.currency || "GBP",
            moq: String(editingProduct.moq || "1"),
            stock: String(editingProduct.stock || "0"),
            category: editingProduct.category || "",
            imageUrl: editingProduct.imageUrl || "",
            images: Array.isArray(editingProduct.images) ? editingProduct.images : [],
            priceVisible: editingProduct.priceVisible !== false,
            status: editingProduct.status || "active",
            // Extended fields to match schema
            packQuantity: String(editingProduct.packQuantity || ""),
            unitOfMeasure: editingProduct.unitOfMeasure || "",
            unitSize: String(editingProduct.unitSize || ""),
            totalPackageWeight: String(editingProduct.totalPackageWeight || ""),
            unitsPerPallet: String(editingProduct.unitsPerPallet || ""),
            palletPrice: String(editingProduct.palletPrice || ""),
            palletMoq: String(editingProduct.palletMoq || ""),
            palletStock: String(editingProduct.palletStock || ""),
            palletWeight: String(editingProduct.palletWeight || ""),
            unitWeight: String(editingProduct.unitWeight || ""),
            lowStockThreshold: String(editingProduct.lowStockThreshold || ""),
            shelfLife: String(editingProduct.shelfLife || ""),
            expiryDate: editingProduct.expiryDate ? String(editingProduct.expiryDate).substring(0, 10) : "",
            unit: editingProduct.unit || "units",
            sellingFormat: editingProduct.sellingFormat || "units",
            deliveryExcluded: Boolean(editingProduct.deliveryExcluded),
            temperatureRequirement: editingProduct.temperatureRequirement || "ambient",
            contentCategory: editingProduct.contentCategory || "general",
            specialHandling: editingProduct.specialHandling || {
              fragile: false,
              perishable: false,
              hazardous: false,
            },
            promotionalOffers: Array.isArray(editingProduct.promotionalOffers) ? editingProduct.promotionalOffers : [],
            costPrice: String(editingProduct.costPrice || ""),
          };
          
          console.log('📝 Safe data being set:', safeData);
          form.reset(safeData);
          console.log('✅ Form safely populated with complete data');

          // Auto-fill unit weight on load if it's blank
          // Priority 1: derive from totalPackageWeight ÷ packQuantity (works for any unit)
          // Priority 2: derive from unitSize × unit-of-measure conversion (weight units only)
          if (!safeData.unitWeight) {
            let autoStr = '';
            if (safeData.totalPackageWeight) {
              const pkgWeight = parseFloat(safeData.totalPackageWeight as string);
              const qty = parseFloat(safeData.packQuantity as string) || 1;
              if (pkgWeight > 0 && qty > 0) {
                const autoKg = Math.round((pkgWeight / qty) * 1000) / 1000;
                if (autoKg > 0) autoStr = autoKg.toString();
              }
            }
            if (!autoStr) {
              const WEIGHT_TO_KG: Record<string, number> = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 };
              const loadConversionFactor = safeData.unitOfMeasure ? WEIGHT_TO_KG[safeData.unitOfMeasure as string] : undefined;
              if (safeData.unitSize && loadConversionFactor) {
                const size = parseFloat(safeData.unitSize as string);
                if (size > 0) {
                  const autoKg = Math.round(size * loadConversionFactor * 1000) / 1000;
                  if (autoKg > 0) autoStr = autoKg.toString();
                }
              }
            }
            if (autoStr) {
              form.setValue('unitWeight', autoStr, { shouldValidate: false });
              lastAutoFilledUnitWeight.current = autoStr;
            }
          } else {
            // DB has a value the user set manually — don't track it as auto-filled
            lastAutoFilledUnitWeight.current = '';
          }
        } catch (error) {
          console.error('❌ Safe form population failed:', error);
        }
      }, 100);
    }
  }, [isDialogOpen, editingProduct, form]);

  // Safe package weight auto-calculation (re-enabled with guards)
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      // Only calculate when user actively changes these specific fields
      if (name === 'packQuantity' || name === 'unitOfMeasure' || name === 'unitSize') {
        const { packQuantity = '', unitOfMeasure = '', unitSize = '' } = values;
        
        if (packQuantity && unitOfMeasure && unitSize) {
          const calculatedWeight = calculateTotalPackageWeight(packQuantity, unitOfMeasure, unitSize);
          
          if (calculatedWeight > 0) {
            // Get current weight to avoid unnecessary updates
            const currentWeight = form.getValues('totalPackageWeight');
            const newWeight = calculatedWeight.toString();
            
            // Only update if the value actually changed
            if (currentWeight !== newWeight) {
              console.log('⚖️ Auto-calculating package weight:', { packQuantity, unitOfMeasure, unitSize, calculatedWeight });
              form.setValue('totalPackageWeight', newWeight, { shouldValidate: false });
              
              // Show calculation info
              toast({
                title: "Weight Auto-Calculated",
                description: `${calculatedWeight}kg (${packQuantity} × ${unitSize}${unitOfMeasure})`,
                duration: 2000,
              });
            }
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form, calculateTotalPackageWeight, toast]);

  // Safe pallet weight auto-calculation (re-enabled with guards)
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      // Only calculate when user actively changes these specific fields
      if (name === 'totalPackageWeight' || name === 'unitsPerPallet') {
        const { totalPackageWeight = '', unitsPerPallet = '' } = values;
        
        if (totalPackageWeight && unitsPerPallet) {
          const packageWeight = parseFloat(totalPackageWeight);
          const units = parseInt(unitsPerPallet);
          
          if (packageWeight > 0 && units > 0) {
            const calculatedPalletWeight = Math.round((packageWeight * units) * 1000) / 1000;
            
            // Get current pallet weight to avoid unnecessary updates
            const currentPalletWeight = form.getValues('palletWeight');
            const newPalletWeight = calculatedPalletWeight.toString();
            
            // Only update if the value actually changed
            if (currentPalletWeight !== newPalletWeight) {
              console.log('🔢 Auto-calculating pallet weight:', { packageWeight, units, calculatedPalletWeight });
              form.setValue('palletWeight', newPalletWeight, { shouldValidate: false });
              
              // Show calculation info
              toast({
                title: "Pallet Weight Auto-Calculated",
                description: `${calculatedPalletWeight}kg (${units} units × ${packageWeight}kg each)`,
                duration: 2000,
              });
            }
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form, toast]);

  // Auto-calculate Unit Weight from Total Package Weight ÷ Pack Quantity
  // Works for ALL unit types (mL, pieces, kg, g, etc.)
  // Only overwrites unitWeight when it is blank OR still holds our last auto-filled value
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== 'totalPackageWeight' && name !== 'packQuantity') return;

      const { totalPackageWeight = '', packQuantity = '' } = values;
      if (!totalPackageWeight) return;

      const pkgWeight = parseFloat(totalPackageWeight as string);
      const qty = parseFloat(packQuantity as string) || 1;
      if (pkgWeight <= 0 || qty <= 0) return;

      const calculatedUnitWeight = Math.round((pkgWeight / qty) * 1000) / 1000;
      if (calculatedUnitWeight <= 0) return;

      const currentUnitWeight = form.getValues('unitWeight');
      const newUnitWeight = calculatedUnitWeight.toString();

      const canOverwrite = currentUnitWeight === '' || currentUnitWeight === lastAutoFilledUnitWeight.current;
      if (!canOverwrite || currentUnitWeight === newUnitWeight) return;

      form.setValue('unitWeight', newUnitWeight, { shouldValidate: false });
      lastAutoFilledUnitWeight.current = newUnitWeight;
    });

    return () => subscription.unsubscribe();
  }, [form, lastAutoFilledUnitWeight]);

  // Auto-fill Unit Weight from Size per Unit when unit of measure is kg / g / lb / oz
  // Only overwrites unitWeight when it is blank OR when it still holds the last value we
  // auto-filled (i.e. the user hasn't manually changed it since).
  useEffect(() => {
    const WEIGHT_TO_KG: Record<string, number> = {
      kg: 1,
      g: 0.001,
      lb: 0.453592,
      oz: 0.0283495,
    };

    const subscription = form.watch((values, { name }) => {
      if (name !== 'unitSize' && name !== 'unitOfMeasure') return;

      const { unitSize = '', unitOfMeasure = '' } = values;
      if (!unitSize || !unitOfMeasure) return;

      const conversionFactor = WEIGHT_TO_KG[unitOfMeasure as string];
      if (!conversionFactor) return; // non-weight unit — leave unitWeight alone

      const size = parseFloat(unitSize as string);
      if (!size || size <= 0) return;

      const calculatedKg = Math.round(size * conversionFactor * 1000) / 1000;
      if (calculatedKg <= 0) return;

      const currentUnitWeight = form.getValues('unitWeight');
      const newUnitWeight = calculatedKg.toString();

      // Only auto-fill if the field is blank or still holds our last auto-filled value
      const canOverwrite = currentUnitWeight === '' || currentUnitWeight === lastAutoFilledUnitWeight.current;
      if (!canOverwrite || currentUnitWeight === newUnitWeight) return;

      form.setValue('unitWeight', newUnitWeight, { shouldValidate: false });
      lastAutoFilledUnitWeight.current = newUnitWeight;
      toast({
        title: "Unit Weight Auto-Calculated",
        description: `${calculatedKg}kg per unit (${size}${unitOfMeasure})`,
        duration: 2000,
      });
    });

    return () => subscription.unsubscribe();
  }, [form, toast, lastAutoFilledUnitWeight]);

  // DISABLED: Auto-determine selling format - now controlled manually by dropdown
  // useEffect(() => {
  //   const subscription = form.watch((values, { name }) => {
  //     // Only check when pallet-related fields change
  //     if (name && ['unitsPerPallet', 'palletPrice', 'palletMoq', 'palletStock'].includes(name)) {
  //       const { unitsPerPallet, palletPrice, palletMoq, palletStock, sellingFormat } = values;
  //       
  //       // Check if all pallet configuration fields are provided
  //       const hasPalletConfig = !!(unitsPerPallet && palletPrice && palletMoq && palletStock);
  //       
  //       let newSellingFormat: "units" | "pallets" | "both" = 'units'; // default
  //       if (hasPalletConfig) {
  //         newSellingFormat = 'both'; // units and pallets
  //       }
  //       
  //       // Only update if the value actually changed
  //       if (sellingFormat !== newSellingFormat) {
  //         console.log('🏷️ Auto-updating selling format:', { from: sellingFormat, to: newSellingFormat, hasPalletConfig });
  //         form.setValue('sellingFormat', newSellingFormat, { shouldValidate: false });
  //       }
  //     }
  //   });

  //   return () => subscription.unsubscribe();
  // }, [form]);

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
        const generatedDescription = data.description;
        
        // Set the description value
        form.setValue("description", generatedDescription);
        
        // Validate character count and provide feedback
        if (generatedDescription.length > 100) {
          toast({
            title: "Description Generated (Warning)",
            description: `Generated description is ${generatedDescription.length} characters. Please trim to 100 characters max.`,
            variant: "destructive",
          });
        } else if (generatedDescription.length > 85) {
          toast({
            title: "Description Generated",
            description: `Generated ${generatedDescription.length} characters. Consider keeping under 85 for best results.`,
          });
        } else {
          toast({
            title: "Description Generated",
            description: `Perfect! Generated ${generatedDescription.length} characters within optimal range.`,
          });
        }
        
        // Trigger form validation to show any errors
        form.trigger("description");
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
        description: `Failed to process image file: ${error instanceof Error ? error.message : "Unknown error"}`,
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
        description: `Failed to process image files: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    }
  };

  const removeImage = (imageIndex: number, currentImages: string[], onChange: (value: string[]) => void) => {
    const updatedImages = currentImages.filter((_, index) => index !== imageIndex);
    onChange(updatedImages);
  };

  const { data: products, isLoading, error } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch(`/api/products`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      
      const data = await response.json();
      return data;
    },
    enabled: true,
  });

  // Auto-open edit/stock modal when navigated from the product detail page
  useEffect(() => {
    if (!products || products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    const stockId = params.get('stock');
    const from = params.get('from');
    if (from) setNavigateBackTo(from);
    else setNavigateBackTo(null);
    if (editId) {
      const found = products.find((p) => p.id === parseInt(editId));
      if (found) {
        setEditingProduct(found);
        setIsDialogOpen(true);
        window.history.replaceState({}, '', '/products');
      }
    } else if (stockId) {
      const found = products.find((p) => p.id === parseInt(stockId));
      if (found) {
        setStockProduct(found);
        window.history.replaceState({}, '', '/products');
      }
    }
  }, [products]);

  // Debug logging
  console.log('Product management state:', {
    user: user?.id,
    productsCount: products?.length,
    isLoading,
    error,
    filteredProductsCount: products?.filter((product: any) => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.description?.toLowerCase().includes(searchQuery.toLowerCase());
      if (statusFilter === "expiring") {
        const now = Date.now();
        const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
        const hasExpiryDate = !!product.expiryDate;
        const nearestExpiryTime = product.nearestExpiry ? new Date(product.nearestExpiry).getTime() : null;
        const hasNearestExpirySoon = nearestExpiryTime !== null && nearestExpiryTime >= now && nearestExpiryTime <= thirtyDaysFromNow;
        return matchesSearch && (hasExpiryDate || hasNearestExpirySoon);
      }
      const matchesStatus = statusFilter === "all" || product.status === statusFilter || (statusFilter === "out_of_stock" && (product.stock === 0 || product.stock === null));
      return matchesSearch && matchesStatus;
    }).length
  });

  // Fetch stock alerts count
  const { data: alertsData } = useQuery({
    queryKey: ['/api/stock-alerts/count'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch plan limits for downgrade warning banner
  const { data: planLimits, isLoading: planLimitsLoading } = useQuery<{
    plan: string;
    limits: { products: number; broadcasts: number; teamMembers: number };
    usage: { products: number; broadcasts: number; teamMembers: number };
    cancelAtPeriodEnd: boolean;
    subscriptionPeriodEnd: string | null;
  }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    staleTime: 5 * 60 * 1000,
  });

  const handleAddProductClick = () => {
    const limit = planLimits?.limits?.products;
    const usage = planLimits?.usage?.products ?? 0;
    if (limit !== undefined && limit !== -1 && usage >= limit) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingProduct(null);
    form.reset({
      name: "",
      description: "",
      price: "",
      currency: "GBP",
      moq: "1",
      stock: "0",
      category: "",
      imageUrl: "",
      priceVisible: true,
      status: "active",
      unit: "units",
      unitsPerPallet: "",
      promotionalOffers: [],
    });
    setIsDialogOpen(true);
  };

  useEffect(() => {
    const effectiveUserId = user?.role === 'team_member' && user?.wholesalerId
      ? user.wholesalerId
      : user?.id;

    setMobileTopBarActions(
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => window.open(`/preview-store/${effectiveUserId}`, '_blank')}
          className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Preview Store"
        >
          <Package className="h-5 w-5" />
        </button>
        {!isViewer && (
          <button
            onClick={handleAddProductClick}
            disabled={planLimitsLoading}
            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Add Product"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
    );
    return () => setMobileTopBarActions(null);
  }, [user, isViewer, planLimitsLoading, planLimits, setMobileTopBarActions]);

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const productData = {
        ...data,
        price: parseFloat(data.price),
        moq: parseInt(data.moq),
        stock: parseInt(data.stock),
        unitsPerPallet: data.unitsPerPallet && data.unitsPerPallet !== "" ? parseInt(data.unitsPerPallet) : null,
        palletPrice: data.palletPrice && data.palletPrice !== "" ? parseFloat(data.palletPrice) : null,
        palletMoq: data.palletMoq && data.palletMoq !== "" ? parseInt(data.palletMoq) : null,
        palletStock: data.palletStock && data.palletStock !== "" ? parseInt(data.palletStock) : null,
        palletWeight: data.palletWeight && data.palletWeight !== "" ? parseFloat(data.palletWeight) : null,
        unitWeight: data.unitWeight && data.unitWeight !== "" ? parseFloat(data.unitWeight) : null,
        lowStockThreshold: data.lowStockThreshold ? parseInt(data.lowStockThreshold) : (user?.defaultLowStockThreshold || 50),
        shelfLife: data.shelfLife ? parseInt(data.shelfLife) : null,
        costPrice: data.costPrice && data.costPrice !== "" ? parseFloat(data.costPrice) : null,
        // Include promotional offers
        promotionalOffers: data.promotionalOffers || [],
      };
      
      // Debug: Log the processed data being sent to server
      console.log('🔍 PALLET CONFIG DEBUG: Processed product data being sent to server:', {
        unitsPerPallet: productData.unitsPerPallet,
        palletPrice: productData.palletPrice,
        palletMoq: productData.palletMoq,
        palletStock: productData.palletStock,
        palletWeight: productData.palletWeight
      });
      
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
    onError: (error: any) => {
      if (error.message.includes("403") && error.message.toLowerCase().includes("product limit")) {
        setIsDialogOpen(false);
        setShowUpgradeModal(true);
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
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
        unitsPerPallet: productData.unitsPerPallet && productData.unitsPerPallet !== "" ? parseInt(productData.unitsPerPallet) : null,
        palletPrice: productData.palletPrice && productData.palletPrice !== "" ? parseFloat(productData.palletPrice) : null,
        palletMoq: productData.palletMoq && productData.palletMoq !== "" ? parseInt(productData.palletMoq) : null,
        palletStock: productData.palletStock && productData.palletStock !== "" ? parseInt(productData.palletStock) : null,
        palletWeight: productData.palletWeight && productData.palletWeight !== "" ? parseFloat(productData.palletWeight) : null,
        unitWeight: productData.unitWeight && productData.unitWeight !== "" ? parseFloat(productData.unitWeight) : null,
        lowStockThreshold: productData.lowStockThreshold ? parseInt(productData.lowStockThreshold) : (user?.defaultLowStockThreshold || 50),
        shelfLife: productData.shelfLife ? parseInt(productData.shelfLife) : null,
        sellingFormat: productData.sellingFormat || "units",
        costPrice: productData.costPrice && productData.costPrice !== "" ? parseFloat(productData.costPrice) : null,
        // Include promotional offers
        promotionalOffers: productData.promotionalOffers || [],
      };
      
      // Debug: Log the processed data being sent to server for update
      console.log('🔍 PALLET CONFIG DEBUG: Update data being sent to server for product', id, ':', {
        sellingFormat: updatedData.sellingFormat,
        unitsPerPallet: updatedData.unitsPerPallet,
        palletPrice: updatedData.palletPrice,
        palletMoq: updatedData.palletMoq,
        palletStock: updatedData.palletStock,
        palletWeight: updatedData.palletWeight
      });
      
      return await apiRequest("PATCH", `/api/products/${id}`, updatedData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      setEditingProduct(null);
      toast({
        title: "Saved",
        description: "Product updated successfully",
      });
      if (navigateBackTo) {
        const dest = navigateBackTo;
        setNavigateBackTo(null);
        navigate(dest);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update product",
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
    // Debug: Log all pallet configuration data before submission
    console.log('🔍 PALLET CONFIG DEBUG: Form submission data:', {
      sellingFormat: data.sellingFormat,
      unitsPerPallet: data.unitsPerPallet,
      palletPrice: data.palletPrice,
      palletMoq: data.palletMoq,
      palletStock: data.palletStock,
      palletWeight: data.palletWeight,
      isEditing: !!editingProduct,
      editingProductId: editingProduct?.id
    });
    
    if (editingProduct) {
      updateProductMutation.mutate({ ...data, id: editingProduct.id });
    } else {
      createProductMutation.mutate(data);
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProductMutation.mutate(id);
    }
  };

  const handleDuplicate = (product: any) => {
    console.log('🔍 DUPLICATE HANDLER DEBUG:', {
      productId: product.id,
      productName: product.name,
      authUser: user,
      mockUser: !user ? "Using mock user for testing" : "Using real user"
    });
    
    // Reset the form with the product data but clear the ID to create a new product
    setEditingProduct(null); // Set to null so it creates instead of edits
    
    try {
      form.reset({
        name: `${product.name} (Copy)`,
        description: product.description || "",
        price: String(product.price || ""),
        currency: product.currency || "GBP",
        moq: String(product.moq || ""),
        stock: String(product.stock || ""),
        category: product.category || "",
        imageUrl: "", // Clear image URL when duplicating
        images: [], // Clear images array when duplicating
        priceVisible: Boolean(product.priceVisible),
        status: product.status || "active",
        // Flexible unit system
        packQuantity: String(product.packQuantity || ""),
        unitOfMeasure: product.unitOfMeasure || "",
        unitSize: String(product.unitSize || ""),
        // Weight and shipping fields
        totalPackageWeight: String(product.totalPackageWeight || ""),
        deliveryExcluded: Boolean(product.deliveryExcluded),
        temperatureRequirement: product.temperatureRequirement || "ambient",
        contentCategory: product.contentCategory || "general",
        specialHandling: typeof product.specialHandling === 'object' ? product.specialHandling : {},
        shelfLife: String(product.shelfLife || ""),
        expiryDate: product.expiryDate ? String(product.expiryDate).substring(0, 10) : "",
        lowStockThreshold: String(product.lowStockThreshold || "50"),
        // Pallet configuration fields
        sellingFormat: product.sellingFormat || "units",
        unitsPerPallet: String(product.unitsPerPallet || ""),
        palletPrice: String(product.palletPrice || ""),
        palletMoq: String(product.palletMoq || ""),
        palletStock: String(product.palletStock || ""),
        palletWeight: String(product.palletWeight || ""),
        // Promotional offers  
        promotionalOffers: Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [],
      });
    } catch (error) {
      console.error('❌ Duplicate form reset failed:', error);
      form.reset();
    }
    setIsDialogOpen(true);
  };

  const handleStatusChange = (id: number, status: "active" | "inactive" | "out_of_stock" | "locked") => {
    console.log("Status change handler called:", id, status);
    // Only allow valid status updates that the mutation accepts
    if (status === "locked") {
      toast({
        title: "Cannot update status",
        description: "Product is locked and cannot be modified",
        variant: "destructive",
      });
      return;
    }
    updateProductStatusMutation.mutate({ id, status });
  };

  const { data: stockMovements, isLoading: isLoadingMovements } = useQuery({
    queryKey: [`/api/products/${stockProduct?.id}/stock-movements`],
    enabled: !!stockProduct,
  });

  const stockAdjustmentMutation = useMutation({
    mutationFn: async ({ productId, adjustmentType, quantity, reason }: { productId: number; adjustmentType: string; quantity: number; reason: string }) => {
      return apiRequest('POST', `/api/products/${productId}/stock-adjustment`, { adjustmentType, quantity, reason });
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      // Sync stock alerts — auto-resolve clears alert cards if stock is now above threshold
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/count'] });
      const qty = variables.quantity;
      const newStock = variables.adjustmentType === 'increase'
        ? stockProduct.stock + qty
        : Math.max(0, stockProduct.stock - qty);
      setStockProduct((prev: any) => prev ? { ...prev, stock: newStock } : null);
      toast({ title: "Stock updated", description: `Stock ${stockAdjustmentType === 'increase' ? 'increased' : 'decreased'} by ${stockQuantity} units` });
      setStockQuantity("");
      setStockReason("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update stock", variant: "destructive" });
    },
  });

  const { data: productBatches, isLoading: isLoadingBatches } = useQuery({
    queryKey: [`/api/products/${expandedBatchProductId}/batches`],
    enabled: !!expandedBatchProductId,
  });

  const { data: modalBatches, isLoading: isLoadingModalBatches } = useQuery({
    queryKey: [`/api/products/${stockProduct?.id}/batches`],
    enabled: !!stockProduct && (stockProduct.batchCount ?? 0) > 0,
  });

  const removeBatchStockMutation = useMutation({
    mutationFn: async ({ productId, batchId, delta, reason }: {
      productId: number; batchId: number; delta: number; reason: string;
    }) => {
      return apiRequest('PATCH', `/api/products/${productId}/batches/${batchId}`, { delta, reason });
    },
    onSuccess: (_, variables) => {
      // Mirror the same local-state update pattern as stockAdjustmentMutation so the
      // modal header "Current Stock" reflects the change immediately (delta is negative).
      const newStock = Math.max(0, (stockProduct?.stock ?? 0) + variables.delta);
      setStockProduct((prev: any) => prev ? { ...prev, stock: newStock } : null);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      toast({ title: "Stock removed", description: "Batch updated and stock movement recorded" });
      setStockQuantity("");
      setStockReason("");
      setSelectedBatchId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove stock from batch", variant: "destructive" });
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: async ({ productId, quantity, expiryDate, batchNumber, costPrice }: {
      productId: number; quantity: number; expiryDate?: string; batchNumber?: string; costPrice?: string;
    }) => {
      return apiRequest('POST', `/api/products/${productId}/batches`, {
        quantity,
        expiryDate: expiryDate || null,
        batchNumber: batchNumber || null,
        costPrice: costPrice || null,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      toast({ title: "Batch added", description: "New stock batch recorded successfully" });
      setStockQuantity("");
      setBatchExpiry("");
      setBatchRef("");
      setBatchCostPrice("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add batch", variant: "destructive" });
    },
  });

  const adjustBatchMutation = useMutation({
    mutationFn: async ({ productId, batchId, delta, reason }: {
      productId: number; batchId: number; delta: number; reason: string;
    }) => {
      return apiRequest('PATCH', `/api/products/${productId}/batches/${batchId}`, { delta, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      toast({ title: "Batch updated", description: "Batch quantity adjusted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to adjust batch", variant: "destructive" });
    },
  });

  const updateExpiryMutation = useMutation({
    mutationFn: async ({ productId, batchId, expiryDate }: { productId: number; batchId: number; expiryDate: string | null }) => {
      return apiRequest('PATCH', `/api/products/${productId}/batches/${batchId}`, { expiryDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      setEditingExpiryBatchId(null);
      toast({ title: "Expiry updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update expiry date", variant: "destructive" });
    },
  });

  const depleteBatchMutation = useMutation({
    mutationFn: async ({ productId, batchId }: { productId: number; batchId: number }) => {
      return apiRequest('DELETE', `/api/products/${productId}/batches/${batchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      toast({ title: "Batch depleted", description: "Batch marked as depleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to deplete batch", variant: "destructive" });
    },
  });

  const handleAddBatch = () => {
    if (!stockProduct || !stockQuantity) return;
    const qty = parseInt(stockQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive number", variant: "destructive" });
      return;
    }
    createBatchMutation.mutate({
      productId: stockProduct.id,
      quantity: qty,
      expiryDate: batchExpiry || undefined,
      batchNumber: batchRef || undefined,
      costPrice: batchCostPrice || undefined,
    });
  };

  const handleStockAdjustment = () => {
    if (!stockProduct || !stockQuantity || !stockReason) return;
    const qty = parseInt(stockQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive number", variant: "destructive" });
      return;
    }
    if (stockAdjustmentType === "decrease" && qty > stockProduct.stock) {
      toast({ title: "Insufficient stock", description: `Cannot remove more than ${stockProduct.stock} units`, variant: "destructive" });
      return;
    }
    stockAdjustmentMutation.mutate({
      productId: stockProduct.id,
      adjustmentType: stockAdjustmentType,
      quantity: qty,
      reason: stockReason,
    });
  };

  const handleBatchRemoval = () => {
    if (!stockProduct || !stockQuantity || !stockReason) return;
    const qty = parseInt(stockQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive number", variant: "destructive" });
      return;
    }
    // Resolve batch against current modalBatches — hard-fail if not found (stale ID guard)
    const selectedBatch = (modalBatches as any[])?.find((b: any) => b.id === selectedBatchId);
    if (!selectedBatch) {
      toast({ title: "Please select a batch", description: "Tap a batch from the list above", variant: "destructive" });
      setSelectedBatchId(null);
      return;
    }
    if (qty > selectedBatch.quantity) {
      toast({ title: "Insufficient batch stock", description: `This batch only has ${formatNumber(selectedBatch.quantity)} units`, variant: "destructive" });
      return;
    }
    removeBatchStockMutation.mutate({
      productId: stockProduct.id,
      batchId: selectedBatch.id,
      delta: -qty,
      reason: stockReason,
    });
  };

  const handleBatchTopUp = () => {
    if (!stockProduct || !topUpBatchId || !topUpQuantity) return;
    const qty = Number(topUpQuantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive whole number", variant: "destructive" });
      return;
    }
    adjustBatchMutation.mutate(
      { productId: stockProduct.id, batchId: topUpBatchId, delta: qty, reason: 'Manual top-up' },
      {
        onSuccess: () => {
          setStockProduct((prev: any) => prev ? { ...prev, stock: (prev.stock ?? 0) + qty } : null);
          setTopUpBatchId(null);
          setTopUpQuantity("");
        },
      }
    );
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
        status: row.status || "active",
        unit: row.unit || "units",
        unitFormat: row.unitFormat || "none",
        sellingFormat: row.sellingFormat || "units",
        unitsPerPallet: row.unitsPerPallet || "",
        palletPrice: row.palletPrice || "",
        palletMoq: row.palletMoq || "",
        palletStock: row.palletStock || "",

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
            unitsPerPallet: product.unitsPerPallet ? parseInt(product.unitsPerPallet) : null,
            palletPrice: product.palletPrice ? parseFloat(product.palletPrice) : null,
            palletMoq: product.palletMoq ? parseInt(product.palletMoq) : null,
            palletStock: product.palletStock ? parseInt(product.palletStock) : null,
            unit: product.unit || "units",
            unitFormat: product.unitFormat === "" ? "none" : (product.unitFormat || "none"),

            palletWeight: product.palletWeight || null,
          };
          const result = await apiRequest("POST", "/api/products", productData);
          results.push({ success: true, product: result });
        } catch (error) {
          results.push({ success: false, error: error instanceof Error ? error.message : "Unknown error", product: product.name });
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
        status: "active",
        unit: "kg",
        unitFormat: "25kg bags",
        sellingFormat: "units",
        unitsPerPallet: "40",
        palletPrice: "950.00",
        palletMoq: "1",
        palletStock: "5",

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
        status: "active",
        unit: "ml",
        unitFormat: "12 x 500ml",
        sellingFormat: "units",
        unitsPerPallet: "120",
        palletPrice: "850.00",
        palletMoq: "1",
        palletStock: "2",

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
        status: "active",
        unit: "cl",
        unitFormat: "24 x 33cl",
        sellingFormat: "units",
        unitsPerPallet: "480",
        palletPrice: "600.00",
        palletMoq: "1",
        palletStock: "3",

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

  const filteredProducts = (products?.filter((product: any) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === "expiring") {
      const now = Date.now();
      const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
      const hasExpiryDate = !!product.expiryDate;
      const nearestExpiryTime = product.nearestExpiry ? new Date(product.nearestExpiry).getTime() : null;
      const hasNearestExpirySoon = nearestExpiryTime !== null && nearestExpiryTime >= now && nearestExpiryTime <= thirtyDaysFromNow;
      return matchesSearch && (hasExpiryDate || hasNearestExpirySoon);
    }
    const matchesStatus = statusFilter === "all" || product.status === statusFilter || (statusFilter === "out_of_stock" && (product.stock === 0 || product.stock === null));
    return matchesSearch && matchesStatus;
  }) || []).sort((a: any, b: any) => {
    if (marginSort !== "none") {
      const getMargin = (p: any): number | null => {
        const price = parseFloat(String(p.price));
        const cost = parseFloat(String(p.costPrice));
        if (!isFinite(price) || !isFinite(cost) || price <= 0 || p.costPrice === null || p.costPrice === undefined || p.costPrice === "") return null;
        return ((price - cost) / price) * 100;
      };
      const ma = getMargin(a);
      const mb = getMargin(b);
      if (ma === null && mb === null) return 0;
      if (ma === null) return 1;
      if (mb === null) return -1;
      return marginSort === "asc" ? ma - mb : mb - ma;
    }
    if (statusFilter === "expiring") {
      const getExpiryTime = (p: any): number => {
        const fromExpiryDate = p.expiryDate ? new Date(p.expiryDate).getTime() : Infinity;
        const fromNearestExpiry = p.nearestExpiry ? new Date(p.nearestExpiry).getTime() : Infinity;
        return Math.min(fromExpiryDate, fromNearestExpiry);
      };
      return getExpiryTime(a) - getExpiryTime(b);
    }
    return 0;
  });

  const hasCostPrice = filteredProducts.some(
    (p: any) => p.costPrice !== null && p.costPrice !== undefined && p.costPrice !== ""
  );

  const calcMarginPct = (price: string | number, costPrice: string | number): number | null => {
    const p = parseFloat(String(price));
    const c = parseFloat(String(costPrice));
    if (!isFinite(p) || !isFinite(c) || p <= 0) return null;
    return ((p - c) / p) * 100;
  };

  return (
    <>
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <PageHeader title="Products" description="Manage your inventory, pricing, and product details.">
        {(alertsData as any)?.count > 0 && (
          <Link href="/stock-alerts">
            <Button variant="outline" size="sm" className="flex items-center gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
              <AlertTriangle className="h-4 w-4" />
              {(alertsData as any).count} Stock Alert{(alertsData as any).count !== 1 ? "s" : ""}
            </Button>
          </Link>
        )}
      </PageHeader>
      <div className="px-4 sm:px-6 py-5">
            {/* Downgrade warning banner — compact */}
            {planLimits?.cancelAtPeriodEnd && (planLimits.usage.products > 2) && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>
                  <span className="font-semibold">Downgrade scheduled:</span>{" "}
                  Plan moves to Free{planLimits.subscriptionPeriodEnd ? ' on ' + new Date(planLimits.subscriptionPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}.{" "}
                  {planLimits.usage.products - 2} of {planLimits.usage.products} products will lock.{" "}
                  <a href="/subscription-pricing" className="font-semibold underline hover:text-amber-900">View billing →</a>
                </span>
              </div>
            )}
            {/* Action Buttons Section */}
            <div className="flex items-center justify-between gap-3 mb-4">
              {/* Secondary actions */}
              <div className="flex items-center gap-2">
                {/* Preview Store — standalone on desktop, omitted on mobile (top bar has it) */}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                  onClick={() => {
                    const effectiveUserId = user?.role === 'team_member' && user?.wholesalerId ? user.wholesalerId : user?.id;
                    window.open(`/preview-store/${effectiveUserId}`, '_blank');
                  }}
                >
                  <Package className="h-4 w-4" />
                  Preview Store
                </Button>

                {/* More dropdown — CSV + Bulk Upload only (desktop and mobile) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="hidden sm:inline">More</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem onClick={downloadTemplate}>
                      <Download className="h-4 w-4 mr-2" /> CSV Template
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsBulkUploadDialogOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" /> Bulk Upload
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Primary action + usage counter */}
              {!isViewer && (
                <div className="flex items-center gap-3">
                  {planLimits && planLimits.limits.products !== -1 && (
                    <span className="text-xs text-slate-400 hidden sm:block">
                      {planLimits.usage.products}/{planLimits.limits.products} products
                    </span>
                  )}
                  <ContextualHelpBubble
                    topic="Products"
                    title="Managing Your Products"
                    steps={helpContent.productManagement.steps}
                  />
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white hidden sm:flex"
                    disabled={planLimitsLoading}
                    onClick={handleAddProductClick}
                    data-onboarding="add-product-button"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Product
                  </Button>
                </div>
              )}
            </div>

            {/* Bulk Upload Dialog — controlled via state */}
                <Dialog open={isBulkUploadDialogOpen} onOpenChange={setIsBulkUploadDialogOpen}>
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
                          <p><strong>Optional columns:</strong> description, promoPrice, promoActive, currency, category, imageUrl, priceVisible, status, unit, unitFormat, sellingFormat, unitsPerPallet, palletPrice, palletMoq, palletStock, palletWeight, temperatureRequirement, contentCategory, supportsPickup, supportsDelivery</p>
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

              {/* Standalone Dialog without DialogTrigger */}
              <Dialog 
                open={isDialogOpen} 
                onOpenChange={(open) => {
                  console.log('🔄 Dialog onOpenChange called:', { open, currentState: isDialogOpen });
                  setIsDialogOpen(open);
                  if (!open && navigateBackTo) {
                    const dest = navigateBackTo;
                    setNavigateBackTo(null);
                    navigate(dest);
                  } else if (!open) {
                    setNavigateBackTo(null);
                  }
                }}
              >
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
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
                              <Select onValueChange={field.onChange} value={field.value || undefined}>
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
                              <ButtonLoader
                                isLoading={isGeneratingDescription}
                                variant="default"
                                size="sm"
                                className="h-9 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 font-medium relative z-10 flex items-center justify-center"
                                onClick={generateDescription}
                              >
                                <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                                AI Generate
                              </ButtonLoader>
                            </div>
                            <FormControl>
                              <Textarea 
                                placeholder="Short punchy summary (max 100 characters)" 
                                maxLength={100}
                                {...field} 
                              />
                            </FormControl>
                            <div className="flex justify-between text-xs mt-1">
                              <span className="text-gray-500">Short punchy summary</span>
                              <span className={
                                (field.value?.length || 0) > 100 
                                  ? "text-red-600 font-medium" 
                                  : (field.value?.length || 0) > 85
                                    ? "text-amber-600 font-medium"
                                    : "text-gray-500"
                              }>
                                {field.value?.length || 0}/100
                                {(field.value?.length || 0) > 100 && (
                                  <span className="ml-1 text-red-600">⚠️ Exceeds limit</span>
                                )}
                              </span>
                            </div>
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
                              <FormLabel>Selling Price (£)</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="costPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cost Price (£) <span className="text-gray-400 font-normal text-xs">optional</span></FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" placeholder="0.00" {...field} />
                              </FormControl>
                              <FormDescription className="text-xs text-muted-foreground">
                                Used as the default for margin calculations. Each stock batch can set its own cost, which takes priority.
                              </FormDescription>
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
                              {editingProduct?.batchCount > 0 ? (
                                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                                  <span className="text-sm font-medium text-gray-700">{field.value || 0}</span>
                                  <p className="text-xs text-gray-400 mt-0.5">Managed by batches — use Manage Stock to adjust</p>
                                </div>
                              ) : (
                                <FormControl>
                                  <Input type="number" placeholder="0" {...field} />
                                </FormControl>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="lowStockThreshold"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Low Stock Alert Threshold</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder={String(user?.defaultLowStockThreshold || 50)}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-gray-500 mt-1">
                              Overrides the default for this product only. Leave blank to fall back to your account default (currently {user?.defaultLowStockThreshold || 50} units — set in Settings → Notifications).
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="expiryDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expiry Date <span className="text-gray-400 font-normal">(optional)</span></FormLabel>
                            {editingProduct?.batchCount > 0 ? (
                              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                                <span className="text-sm font-medium text-gray-700">
                                  {editingProduct.nearestExpiry
                                    ? new Date(editingProduct.nearestExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                    : 'No batch expiry set'}
                                </span>
                                <p className="text-xs text-gray-400 mt-0.5">Set per batch — manage in Manage Stock</p>
                              </div>
                            ) : (
                              <>
                                <FormControl>
                                  <Input type="date" {...field} />
                                </FormControl>
                                <p className="text-xs text-gray-500 mt-1">
                                  Best-before or use-by date. Shown on the product card with colour-coded alerts.
                                </p>
                              </>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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
                          <FormLabel className="text-base">📦 Product Unit Configuration & Weight</FormLabel>
                          <div className="text-sm text-muted-foreground mb-3">
                            Configure packaging, measurements, and weight for accurate shipping calculations
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
                          
                          {/* Total Package Weight for Shipping */}
                          <div className="pt-4 border-t">
                            <FormField
                              control={form.control}
                              name="totalPackageWeight"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Total Package Weight (kg)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      step="0.001" 
                                      placeholder="Auto-calculated" 
                                      {...field}
                                      style={{ 
                                        backgroundColor: field.value ? '#f0f9ff' : 'white',
                                        border: field.value ? '2px solid #0ea5e9' : '1px solid #d1d5db'
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-xs text-muted-foreground">
                                    {field.value ? `Auto-calculated: ${field.value}kg` : 'Complete package weight for shipping quotes'}
                                  </div>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="unitWeight"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Unit Weight (kg)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.001"
                                      placeholder="e.g. 2.5"
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-xs text-muted-foreground">
                                    Auto-calculated from Total Package Weight ÷ Quantity in Pack
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

                      {/* Pallet Configuration Section */}
                      <div className="space-y-4 border rounded-lg p-4 bg-orange-50">
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4 text-orange-600" />
                          <FormLabel className="text-base font-semibold">📦 Pallet Configuration</FormLabel>
                        </div>
                        <div className="text-sm text-muted-foreground mb-3">
                          Configure bulk pallet pricing and quantities for wholesale customers
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name="unitsPerPallet"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Units Per Pallet</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="e.g., 48"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value)}
                                  />
                                </FormControl>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  How many cases/packages per pallet
                                </div>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="palletPrice"
                            render={({ field }) => {
                              const watchedPalletPrice = form.watch("palletPrice");
                              const watchedUnitsPerPallet = form.watch("unitsPerPallet");
                              const palletPriceNum = parseFloat(watchedPalletPrice);
                              const unitsPerPalletNum = parseFloat(watchedUnitsPerPallet);
                              const unitPrice =
                                palletPriceNum > 0 && unitsPerPalletNum > 0
                                  ? palletPriceNum / unitsPerPalletNum
                                  : null;
                              const currency = form.watch("currency") || "GBP";
                              return (
                                <FormItem>
                                  <FormLabel>Pallet Price ({currency})</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="e.g., 240.00"
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <div className="text-xs text-muted-foreground">
                                    {unitPrice !== null ? (
                                      <>
                                        Total price for full pallet &mdash;{" "}
                                        <span className="font-medium text-orange-700">
                                          {formatCurrency(unitPrice, currency)} per unit
                                        </span>
                                      </>
                                    ) : (
                                      "Total price for full pallet"
                                    )}
                                  </div>
                                </FormItem>
                              );
                            }}
                          />

                          <FormField
                            control={form.control}
                            name="palletMoq"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pallet MOQ</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="e.g., 1"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value)}
                                  />
                                </FormControl>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  Minimum pallet order quantity
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="palletStock"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pallet Stock</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="e.g., 12"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value)}
                                  />
                                </FormControl>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  Available pallets in stock
                                </div>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="palletWeight"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pallet Weight (kg)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    placeholder="Auto-calculated"
                                    {...field}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    style={{ 
                                      backgroundColor: field.value ? '#fff7ed' : '#f9fafb',
                                      border: field.value ? '2px solid #ea580c' : '1px solid #d1d5db',
                                      color: field.value ? '#ea580c' : '#6b7280',
                                      fontWeight: field.value ? 'bold' : 'normal'
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                                <div className="text-xs text-muted-foreground">
                                  {field.value ? `Auto-calculated: ${field.value}kg (Package Weight × Units Per Pallet)` : 'Complete package weight and units per pallet for auto-calculation'}
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="bg-orange-100 p-3 rounded-lg">
                          <p className="text-sm text-orange-700">
                            <strong>Example:</strong> 48 cases per pallet at £240 = £5.00 per case (bulk discount)
                          </p>
                          <p className="text-xs text-orange-600 mt-1">
                            Customers will see tags like: <strong>"📦 Units & Pallet (48/pallet)"</strong> to understand bulk options
                          </p>
                          <p className="text-xs text-orange-600">
                            They can choose: Individual cases, mixed quantities, or full pallets with automatic pricing
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="sellingFormat"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Selling Format</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select selling format" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="units">Units Only</SelectItem>
                                  <SelectItem value="pallets">Pallets Only</SelectItem>
                                  <SelectItem value="both">Units & Pallets</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                              <div className="text-sm text-muted-foreground">
                                Controls what customers see: "Units Only", "Pallets Only", or "Units & Pallets" tag
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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



                      {/* Shipping Requirements Section */}
                      <div className="space-y-4 border rounded-lg p-4 bg-green-50">
                        <div>
                          <FormLabel className="text-base font-semibold">🚚 Shipping Requirements</FormLabel>
                          <div className="text-sm text-muted-foreground mb-3">
                            Additional shipping and handling requirements
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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



                      {/* Promotional Offers Section - temporarily hidden until fully working */}

                      <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 mt-6">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <ButtonLoader
                          isLoading={createProductMutation.isPending || updateProductMutation.isPending}
                          variant={editingProduct ? "processing" : "default"}
                          size="md"
                          onClick={form.handleSubmit(onSubmit)}
                        >
                          {editingProduct ? "Update Product" : "Save Product"}
                        </ButtonLoader>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

        {/* Filters and Search */}
        <div className="sticky top-14 lg:top-0 z-10 bg-white border-b border-slate-100 py-2 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-8 border-slate-200 rounded-lg focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 border-slate-200 rounded-lg">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                <SelectItem value="expiring">Expiring Products</SelectItem>
              </SelectContent>
            </Select>
            <Select value={marginSort} onValueChange={(v) => handleSetMarginSort(v as "none" | "asc" | "desc")}>
              <SelectTrigger className="w-[160px] h-8 border-slate-200 rounded-lg">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default order</SelectItem>
                <SelectItem value="asc">Margin (low → high)</SelectItem>
                <SelectItem value="desc">Margin (high → low)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleSetViewMode("grid")}
                className="p-1.5 h-9 w-9"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleSetViewMode("list")}
                className="p-1.5 h-9 w-9"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

          {/* Products Grid/List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <ElephantLoader message="Loading your product inventory..." />
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {filteredProducts.map((product: any) => (
                <div key={product.id} className="space-y-3">
                  <ProductCard
                    product={product}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onStatusChange={handleStatusChange}
                    onManageStock={(p) => { setStockProduct(p); setStockAdjustmentType("increase"); setStockQuantity(""); setStockReason(""); setBatchExpiry(""); setBatchRef(""); setBatchCostPrice(p.costPrice ? String(p.costPrice) : ""); }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProducts.map((product: any) => (
                <div key={product.id} className="space-y-3">
                  <Card className={`transition-all duration-200 ${product.status === 'locked' ? 'opacity-50 grayscale border-gray-200 cursor-not-allowed' : 'hover:shadow-md hover:border-slate-300'}`}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <img 
                          src={
                            (product.images && product.images.length > 0) 
                              ? product.images[0] 
                              : (product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100")
                          } 
                          alt={product.name}
                          className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {product.status === 'locked'
                              ? <Lock className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                              : <LockOpen className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            }
                            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">{product.name}</h3>
                          </div>
                          {/* Row 1: status + stock alert badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <Badge variant={product.status === "active" ? "default" : (product.status === "inactive" ? "secondary" : "destructive")} className="text-xs">
                              {product.status === "active" ? "Active" : (product.status === "inactive" ? "Inactive" : "Out of Stock")}
                            </Badge>
                            {product.stock === 0 && product.status !== "out_of_stock" && (
                              <Badge className="text-xs bg-red-500 text-white">Out of Stock</Badge>
                            )}
                            {product.stock > 0 && product.stock <= (product.lowStockThreshold || 50) && (
                              <Badge className="text-xs bg-amber-500 text-white">Low Stock</Badge>
                            )}
                          </div>
                          {/* Row 2: category + expiry + pack size */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                            {(() => {
                              const effectiveExpiry = product.batchCount > 0
                                ? (product.nearestExpiry || product.expiryDate)
                                : product.expiryDate;
                              if (!effectiveExpiry) return null;
                              const expiry = new Date(effectiveExpiry);
                              const now = new Date(); now.setHours(0, 0, 0, 0);
                              const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                              const formatted = expiry.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
                              if (diffDays < 0) return <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">Expired · {formatted}</Badge>;
                              if (diffDays <= 30) return <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">Expiring soon · {formatted}</Badge>;
                              return <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Exp: {formatted}</Badge>;
                            })()}
                            {product.packQuantity && product.unitSize && product.unitOfMeasure && (
                              <Badge variant="outline" className="text-blue-600 border-blue-600 text-xs">
                                {product.packQuantity} x {Math.round(parseFloat(product.unitSize))}{product.unitOfMeasure}
                              </Badge>
                            )}
                          </div>
                          {/* Row 3: active promotion tags — independent of promoPrice */}
                          {(() => {
                            const now = new Date();
                            const activePromos: PromotionalOffer[] = Array.isArray(product.promotionalOffers)
                              ? product.promotionalOffers.filter((o: PromotionalOffer) => {
                                  if (!o.isActive) return false;
                                  if (o.startDate && new Date(o.startDate) > now) return false;
                                  if (o.endDate && new Date(o.endDate) < now) return false;
                                  return true;
                                })
                              : [];
                            if (activePromos.length === 0) return null;
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {activePromos.map((promo: PromotionalOffer, i: number) => {
                                  let label: string;
                                  switch (promo.type) {
                                    case "percentage_discount": label = `${promo.discountPercentage}% off`; break;
                                    case "fixed_price": label = `Now ${formatCurrency(promo.fixedPrice)}`; break;
                                    case "clearance": label = `Clearance ${formatCurrency(promo.fixedPrice)}`; break;
                                    case "buy_x_get_y_free": label = `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`; break;
                                    case "bundle_deal": label = `${promo.minQuantity}+ at ${formatCurrency(promo.fixedPrice)} each`; break;
                                    default: label = promo.name || "Promo";
                                  }
                                  return (
                                    <Badge key={i} className="text-xs bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200">
                                      🏷 {label}
                                    </Badge>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {product.description && (
                            <p className="text-gray-600 text-xs sm:text-sm mt-2 line-clamp-2">{product.description}</p>
                          )}
                          <div className={`grid gap-2 sm:gap-4 mt-3 text-xs sm:text-sm ${hasCostPrice ? 'grid-cols-4' : 'grid-cols-3'}`}>
                            <div>
                              <span className="text-gray-500">Price:</span>
                              <div className="font-semibold">
                                {product.priceVisible ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {product.promoActive && product.promoPrice ? (
                                      <>
                                        <span className="text-green-600">
                                          {formatMoney(parseFloat(product.promoPrice))}
                                        </span>
                                        <span className="text-gray-500 line-through text-xs">
                                          {formatMoney(parseFloat(product.price))}
                                        </span>
                                      </>
                                    ) : (
                                      formatMoney(parseFloat(product.price))
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
                              {product.batchCount > 0 && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  {product.batchCount} batch{product.batchCount !== 1 ? 'es' : ''}
                                  {product.nearestExpiry && (() => {
                                    const exp = new Date(product.nearestExpiry);
                                    const now = new Date(); now.setHours(0, 0, 0, 0);
                                    const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                    const fmt = exp.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
                                    if (diff < 0) return <span className="text-red-600 font-medium"> · Exp: {fmt}</span>;
                                    if (diff <= 30) return <span className="text-amber-600 font-medium"> · Exp: {fmt}</span>;
                                    return <span> · Exp: {fmt}</span>;
                                  })()}
                                </div>
                              )}
                            </div>
                            {hasCostPrice && (() => {
                              const margin = (product.costPrice !== null && product.costPrice !== undefined && product.costPrice !== "")
                                ? calcMarginPct(product.price, product.costPrice)
                                : null;
                              if (margin === null) {
                                return (
                                  <div>
                                    <span className="text-gray-500">Margin %:</span>
                                    <div className="text-gray-400 font-semibold">—</div>
                                  </div>
                                );
                              }
                              const marginColor = margin < 0
                                ? 'text-red-600'
                                : margin < 15
                                  ? 'text-amber-600'
                                  : 'text-green-600';
                              return (
                                <div>
                                  <span className="text-gray-500">Margin %:</span>
                                  <div className={`font-semibold flex items-center gap-1 ${marginColor}`}>
                                    {margin.toFixed(1)}%
                                    {margin < 0 && <AlertTriangle className="h-3 w-3" />}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                          {/* Action icons below the stats */}
                          {!isViewer && (
                          <div className="flex items-center gap-0.5 mt-2 -ml-1.5">
                            <Button
                              variant="ghost" size="icon" className={`h-8 w-8 ${product.status === 'locked' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => product.status !== 'locked' && handleEdit(product)}
                              disabled={product.status === 'locked'}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className={`h-8 w-8 ${product.status === 'locked' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => { if (product.status !== 'locked') { setStockProduct(product); setStockAdjustmentType("increase"); setStockQuantity(""); setStockReason(""); setBatchExpiry(""); setBatchRef(""); setBatchCostPrice(product.costPrice ? String(product.costPrice) : ""); } }}
                              disabled={product.status === 'locked'}
                              title="Manage Stock"
                            >
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                            {product.batchCount > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700"
                                onClick={() => setExpandedBatchProductId(prev => prev === product.id ? null : product.id)}
                              >
                                {expandedBatchProductId === product.id ? 'Hide batches' : `${product.batchCount} batch${product.batchCount !== 1 ? 'es' : ''}`}
                              </Button>
                            )}
                            <DropdownMenu
                              open={openMenuProductId === product.id}
                              onOpenChange={(open) => setOpenMenuProductId(open ? product.id : null)}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onPointerDown={(e) => e.preventDefault()}
                                  onClick={() => setOpenMenuProductId(prev => prev === product.id ? null : product.id)}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(product.id, product.status === 'active' ? 'inactive' : 'active')}
                                  disabled={product.status === 'locked'}
                                  className={product.status === 'locked' ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  {product.status === 'active' ? (
                                    <><ToggleLeft className="h-4 w-4 mr-2" />Set Inactive</>
                                  ) : (
                                    <><ToggleRight className="h-4 w-4 mr-2" />Set Active</>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => product.status !== 'locked' && handleDuplicate(product)}
                                  disabled={product.status === 'locked'}
                                  className={product.status === 'locked' ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => navigate(`/promotions?productId=${product.id}`)}
                                  disabled={product.status === 'locked'}
                                  className={product.status === 'locked' ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  <div className="relative mr-2">
                                    <Tag className="h-4 w-4" />
                                    {product.promoActive && (
                                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
                                    )}
                                  </div>
                                  Promotions
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDelete(product.id)} className="text-red-600 focus:text-red-600">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Expandable batch breakdown */}
                  {expandedBatchProductId === product.id && (
                    <div className="mt-2 border border-blue-100 rounded-lg bg-blue-50/40 p-3">
                      <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                        <PackagePlus className="h-3.5 w-3.5 text-blue-600" /> Batch Breakdown
                      </h5>
                      {isLoadingBatches ? (
                        <p className="text-xs text-gray-500 py-2 text-center">Loading batches...</p>
                      ) : (productBatches as any[])?.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-blue-100">
                                <th className="text-left py-1 pr-3 font-medium">Batch Ref</th>
                                <th className="text-right py-1 pr-3 font-medium">Qty</th>
                                <th className="text-left py-1 pr-3 font-medium">Expiry</th>
                                <th className="text-right py-1 pr-3 font-medium">Cost</th>
                                <th className="text-left py-1 pr-3 font-medium">Status</th>
                                <th className="text-right py-1 font-medium">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(productBatches as any[]).map((batch: any) => {
                                const isExpired = batch.expiryDate && new Date(batch.expiryDate) < new Date();
                                const isDepleted = batch.status === 'depleted';
                                const expiryFmt = batch.expiryDate
                                  ? new Date(batch.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                  : '—';
                                return (
                                  <tr key={batch.id} className={`border-b border-blue-50 last:border-0 ${isDepleted || isExpired ? 'opacity-50' : ''}`}>
                                    <td className="py-1.5 pr-3 text-gray-700">{batch.batchNumber || 'Initial Stock'}</td>
                                    <td className="py-1.5 pr-3 text-right font-medium">{formatNumber(batch.quantity)}</td>
                                    <td className="py-1.5 pr-3">
                                      {editingExpiryBatchId === batch.id ? (
                                        <input
                                          type="date"
                                          autoFocus
                                          className="text-xs border rounded px-1 py-0.5 w-28"
                                          value={editingExpiryValue}
                                          onChange={e => setEditingExpiryValue(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              expiryEditCancelledRef.current = true; // prevent double-fire from blur
                                              updateExpiryMutation.mutate({ productId: product.id, batchId: batch.id, expiryDate: editingExpiryValue || null });
                                            } else if (e.key === 'Escape') {
                                              expiryEditCancelledRef.current = true;
                                              setEditingExpiryBatchId(null);
                                            }
                                          }}
                                          onBlur={() => {
                                            if (expiryEditCancelledRef.current) {
                                              expiryEditCancelledRef.current = false;
                                              return;
                                            }
                                            updateExpiryMutation.mutate({ productId: product.id, batchId: batch.id, expiryDate: editingExpiryValue || null });
                                          }}
                                        />
                                      ) : (
                                        <span className="flex items-center gap-1">
                                          {batch.expiryDate ? (
                                            <span className={isExpired ? 'text-red-600 font-medium' : new Date(batch.expiryDate) <= new Date(Date.now() + 30*24*60*60*1000) ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                                              {expiryFmt}
                                              {isExpired && ' 🔴'}
                                              {!isExpired && new Date(batch.expiryDate) <= new Date(Date.now() + 30*24*60*60*1000) && ' 🟠'}
                                            </span>
                                          ) : <span className="text-gray-400">—</span>}
                                          <button
                                            className="text-gray-400 hover:text-gray-600"
                                            onClick={() => {
                                              const iso = batch.expiryDate ? String(batch.expiryDate).split('T')[0] : '';
                                              setEditingExpiryValue(iso);
                                              setEditingExpiryBatchId(batch.id);
                                            }}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </button>
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 pr-3 text-right text-gray-600">{batch.costPrice ? formatCurrency(batch.costPrice) : '—'}</td>
                                    <td className="py-1.5 pr-3">
                                      {isDepleted ? (
                                        <Badge className="text-xs bg-gray-100 text-gray-500 border-0">Depleted</Badge>
                                      ) : isExpired ? (
                                        <Badge className="text-xs bg-red-100 text-red-700 border-0">Expired</Badge>
                                      ) : (
                                        <Badge className="text-xs bg-green-100 text-green-700 border-0">Active</Badge>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-right">
                                      {!isDepleted && (
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            className="text-xs text-orange-600 hover:text-orange-800 px-1.5 py-0.5 rounded border border-orange-200 hover:bg-orange-50"
                                            onClick={() => {
                                              const delta = prompt('Enter quantity to remove (negative number reduces stock):');
                                              if (delta && !isNaN(parseInt(delta))) {
                                                adjustBatchMutation.mutate({ productId: product.id, batchId: batch.id, delta: -Math.abs(parseInt(delta)), reason: 'Manual adjustment' });
                                              }
                                            }}
                                          >
                                            Adjust
                                          </button>
                                          <button
                                            className="text-xs text-gray-500 hover:text-red-600 px-1.5 py-0.5 rounded border border-gray-200 hover:bg-red-50"
                                            onClick={() => {
                                              if (confirm('Mark this batch as depleted?')) {
                                                depleteBatchMutation.mutate({ productId: product.id, batchId: batch.id });
                                              }
                                            }}
                                          >
                                            Deplete
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 py-2 text-center">No batches found</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isLoading && filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No products found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {statusFilter === "expiring"
                  ? "No expiry dates set — add expiry dates to your products to track them here"
                  : searchQuery || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by creating your first product"}
              </p>
              {!(searchQuery || statusFilter !== "all") && !isViewer && (
                <div className="mt-6">
                  <Button onClick={() => {
                    setEditingProduct(null);
                    form.reset({
                      name: "",
                      description: "",
                      price: "",
                      currency: "GBP",
                      moq: "1",
                      stock: "0",
                      category: "",
                      imageUrl: "",
                      priceVisible: true,
                      status: "active",
                      unit: "units",
                      unitsPerPallet: "",
                      promotionalOffers: [],
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

      <Dialog open={!!stockProduct} onOpenChange={(open) => { if (!open) { setStockProduct(null); setSelectedBatchId(null); setTopUpBatchId(null); setTopUpQuantity(""); setStockQuantity(""); setStockReason(""); if (navigateBackTo) { const dest = navigateBackTo; setNavigateBackTo(null); navigate(dest); } } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-green-600" />
              Manage Stock - {stockProduct?.name}
            </DialogTitle>
          </DialogHeader>
          
          {stockProduct && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Current Stock</span>
                <span className={`text-lg font-bold ${stockProduct.stock > 10 ? 'text-green-600' : stockProduct.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {formatNumber(stockProduct.stock)} units
                </span>
              </div>

              {/* Tab buttons */}
              <div className="flex gap-2">
                <Button
                  variant={stockAdjustmentType === "increase" ? "default" : "outline"}
                  size="sm"
                  className={stockAdjustmentType === "increase" ? "flex-1 bg-green-600 hover:bg-green-700" : "flex-1"}
                  onClick={() => { setStockAdjustmentType("increase"); setStockReason(""); setStockQuantity(""); setSelectedBatchId(null); setTopUpBatchId(null); setTopUpQuantity(""); }}
                >
                  <ArrowUpCircle className="h-4 w-4 mr-1" />
                  Add New Batch
                </Button>
                <Button
                  variant={stockAdjustmentType === "decrease" ? "default" : "outline"}
                  size="sm"
                  className={stockAdjustmentType === "decrease" ? "flex-1 bg-orange-600 hover:bg-orange-700" : "flex-1"}
                  onClick={() => { setStockAdjustmentType("decrease"); setStockReason(""); setStockQuantity(""); setSelectedBatchId(null); setTopUpBatchId(null); setTopUpQuantity(""); }}
                >
                  <ArrowDownCircle className="h-4 w-4 mr-1" />
                  Remove Stock
                </Button>
              </div>

              {/* Shared FEFO-sorted batch list for both modes (batch-tracked products only) */}
              {(() => {
                const hasBatches = (stockProduct.batchCount ?? 0) > 0;
                if (!hasBatches) return null;
                const sortedBatches = [...((modalBatches as any[]) || [])].sort((a: any, b: any) => {
                  if (!a.expiryDate && !b.expiryDate) return 0;
                  if (!a.expiryDate) return 1;
                  if (!b.expiryDate) return -1;
                  return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                });
                const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
                const activeBatches = sortedBatches.filter((b: any) => b.status !== 'depleted' && b.quantity > 0);

                const fmtExpiry = (d: string | null) =>
                  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'No expiry';

                const isRemove = stockAdjustmentType === "decrease";

                return (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {isRemove ? 'Select batch to remove from' : 'Existing batches (FEFO order)'}
                    </p>
                    {isLoadingModalBatches ? (
                      <p className="text-xs text-gray-400 py-2 text-center">Loading batches…</p>
                    ) : activeBatches.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2 text-center italic">All batches depleted — add a new batch to restock</p>
                    ) : (
                      <div className="space-y-1">
                        {activeBatches.map((batch: any, idx: number) => {
                          const label = batch.batchNumber || `Batch ${idx + 1}`;
                          const expiry = fmtExpiry(batch.expiryDate);
                          const isSelected = selectedBatchId === batch.id;
                          if (isRemove) {
                            return (
                              <button
                                key={batch.id}
                                type="button"
                                onClick={() => setSelectedBatchId(isSelected ? null : batch.id)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
                                  isSelected
                                    ? 'bg-orange-50 border-orange-400 ring-1 ring-orange-400'
                                    : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-orange-500' : 'bg-gray-300'}`} />
                                  <span className="font-medium text-gray-800">{label}</span>
                                  <span className="text-gray-400">·</span>
                                  <span className="text-gray-500 text-xs">Exp: {expiry}</span>
                                </div>
                                <span className="font-semibold text-gray-700 flex-shrink-0">{formatNumber(batch.quantity)} units</span>
                              </button>
                            );
                          } else {
                            const isExpired = batch.status !== 'active' || (batch.expiryDate && new Date(batch.expiryDate) < todayDate);
                            const isTopUp = topUpBatchId === batch.id;
                            return (
                              <div key={batch.id} className="rounded-lg border border-gray-200 overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-sm">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isExpired ? 'bg-red-400' : 'bg-green-400'}`} />
                                    <span className={`font-medium ${isExpired ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
                                    <span className="text-gray-300">·</span>
                                    <span className={`text-xs ${isExpired ? 'text-red-400' : 'text-gray-400'}`}>Exp: {expiry}</span>
                                    {isExpired && <span className="text-xs text-red-500 font-medium">(expired)</span>}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`font-semibold ${isExpired ? 'text-gray-400' : 'text-gray-500'}`}>{formatNumber(batch.quantity)} units</span>
                                    {!isExpired && (
                                      <button
                                        type="button"
                                        onClick={() => { setTopUpBatchId(isTopUp ? null : batch.id); setTopUpQuantity(""); }}
                                        className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                                          isTopUp
                                            ? 'bg-green-600 text-white border-green-600'
                                            : 'bg-white text-green-700 border-green-400 hover:bg-green-50'
                                        }`}
                                      >
                                        {isTopUp ? 'Cancel' : 'Add to batch'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {isTopUp && (
                                  <div className="px-3 py-2.5 bg-green-50 border-t border-green-100 flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min="1"
                                      placeholder="Units to add"
                                      value={topUpQuantity}
                                      onChange={(e) => setTopUpQuantity(e.target.value)}
                                      className="h-8 text-sm flex-1"
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      onClick={handleBatchTopUp}
                                      disabled={!topUpQuantity || adjustBatchMutation.isPending}
                                      className="h-8 bg-green-600 hover:bg-green-700 flex-shrink-0"
                                    >
                                      {adjustBatchMutation.isPending ? "Adding…" : `Add ${topUpQuantity || 0}`}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          }
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Add New Batch form */}
              {stockAdjustmentType === "increase" ? (
                <div className="space-y-3 p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs text-green-700 font-medium">Stock is tracked per batch for FEFO (first-expired, first-out) picking.</p>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Quantity <span className="text-red-500">*</span></label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Units in this delivery"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Best Before / Expiry <span className="text-gray-400 text-xs">(optional)</span></label>
                    <Input
                      type="date"
                      value={batchExpiry}
                      onChange={(e) => setBatchExpiry(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Batch Reference <span className="text-gray-400 text-xs">(optional — invoice or delivery ref)</span></label>
                    <Input
                      type="text"
                      placeholder="e.g. INV-2024-001"
                      value={batchRef}
                      onChange={(e) => setBatchRef(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Cost Price per Unit <span className="text-gray-400 text-xs">(optional)</span></label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={stockProduct?.costPrice ? `Default: £${parseFloat(stockProduct.costPrice).toFixed(2)}` : "e.g. 1.50"}
                      value={batchCostPrice}
                      onChange={(e) => setBatchCostPrice(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    onClick={handleAddBatch}
                    disabled={!stockQuantity || createBatchMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {createBatchMutation.isPending ? "Adding..." : `Add ${stockQuantity || 0} units as new batch`}
                  </Button>
                </div>
              ) : (
                /* Remove Stock — batch-aware when batches exist, global otherwise */
                (stockProduct.batchCount ?? 0) > 0 ? (() => {
                  // Resolve against current modalBatches so stale IDs don't slip through
                  const activeBatchList = (modalBatches as any[]) ?? [];
                  const selectedBatch = activeBatchList.find((b: any) => b.id === selectedBatchId) ?? null;
                  return (
                    <div className="space-y-3">
                      {!selectedBatch && (
                        <p className="text-xs text-orange-600 font-medium text-center py-1">↑ Tap a batch above to select it</p>
                      )}
                      {selectedBatch && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700">Quantity to remove</label>
                            <Input
                              type="number"
                              min="1"
                              placeholder="Enter quantity"
                              value={stockQuantity}
                              onChange={(e) => setStockQuantity(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Reason</label>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {["Damaged goods", "Expired stock", "Stock correction", "Customer return"].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setStockReason(preset)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                    stockReason === preset
                                      ? 'bg-orange-600 text-white border-orange-600'
                                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                          </div>
                          <Button
                            onClick={handleBatchRemoval}
                            disabled={!stockQuantity || !stockReason || removeBatchStockMutation.isPending}
                            className="w-full bg-orange-600 hover:bg-orange-700"
                          >
                            {removeBatchStockMutation.isPending ? "Removing…" : (() => {
                              const ref = selectedBatch.batchNumber || 'batch';
                              const exp = selectedBatch.expiryDate ? ` · Exp ${new Date(selectedBatch.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}` : '';
                              return `Remove ${stockQuantity || 0} units from ${ref}${exp}`;
                            })()}
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })() : (
                  /* Non-batch product — original global remove flow */
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Quantity to remove</label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="Enter quantity"
                        value={stockQuantity}
                        onChange={(e) => setStockQuantity(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Reason</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {["Damaged goods", "Expired stock", "Stock correction", "Customer return"].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setStockReason(preset)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              stockReason === preset
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    {stockQuantity && (
                      <div className="p-3 bg-blue-50 rounded-lg text-sm">
                        <span className="text-gray-600">New stock will be: </span>
                        <span className="font-bold text-blue-700">
                          {formatNumber(Math.max(0, stockProduct.stock - parseInt(stockQuantity || "0")))} units
                        </span>
                      </div>
                    )}
                    <Button
                      onClick={handleStockAdjustment}
                      disabled={!stockQuantity || !stockReason || stockAdjustmentMutation.isPending}
                      className="w-full bg-orange-600 hover:bg-orange-700"
                    >
                      {stockAdjustmentMutation.isPending ? "Updating..." : `Remove ${stockQuantity || 0} units`}
                    </Button>
                  </>
                )
              )}

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-gray-500" />
                  Stock Movement History
                </h4>
                {isLoadingMovements ? (
                  <p className="text-sm text-gray-500 text-center py-4">Loading history...</p>
                ) : stockMovements && (stockMovements as any[]).length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {(stockMovements as any[]).slice(0, 20).map((movement: any) => {
                      const isIncrease = movement.quantity > 0;
                      const typeLabel = movement.movementType === 'purchase' ? 'Order'
                        : movement.movementType === 'return' ? 'Return'
                        : movement.movementType === 'manual_increase' ? 'Restocked'
                        : movement.movementType === 'manual_decrease' ? 'Removed'
                        : movement.movementType === 'initial' ? 'Initial Stock'
                        : 'Updated';
                      return (
                        <div key={movement.id} className={`p-2.5 rounded-lg text-xs border-l-3 ${isIncrease ? 'bg-green-50 border-l-green-500' : 'bg-red-50 border-l-red-500'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {isIncrease ? (
                                <ArrowUpCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                              ) : (
                                <ArrowDownCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                              )}
                              <span className={`font-bold ${isIncrease ? 'text-green-700' : 'text-red-700'}`}>
                                {isIncrease ? '+' : ''}{movement.quantity} units
                              </span>
                              <span className="text-gray-500 font-medium">· {typeLabel}</span>
                            </div>
                            <span className="text-gray-400 flex-shrink-0">
                              {new Date(movement.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-gray-500">
                            <span className="truncate">
                              {movement.reason || (movement.customerName ? `Customer: ${movement.customerName}` : '')}
                            </span>
                            <span className="flex-shrink-0 ml-2 font-medium">
                              {movement.stockBefore} → {movement.stockAfter}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No stock movements recorded yet</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>

    <SubscriptionUpgradeModal
      open={showUpgradeModal}
      onOpenChange={setShowUpgradeModal}
      feature="more products"
      currentPlan={planLimits?.plan ?? "Free"}
    />
    </>
  );
}
