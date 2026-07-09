import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Upload, Sparkles, AlertTriangle, Package } from "lucide-react";
import type { Product } from "@shared/schema";
import { currencies } from "@/lib/currencies";
import { useCurrency } from "@/hooks/useCurrency";
import { BASE_UNITS } from "@shared/units";
import { computePackWeightKg } from "@shared/utils/product";
import ButtonLoader from "@/components/ui/button-loader";

export const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional().refine(
    (val) => !val || val.length <= 250,
    { message: "Description must be 250 characters or less" }
  ),
  price: z.string().min(1, "Price is required"),
  currency: z.string().min(1, "Currency is required"),
  moq: z.string().min(1, "MOQ is required"),
  stock: z.string().min(1, "Stock is required"),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  images: z.array(z.string()).optional(),
  priceVisible: z.boolean(),
  hiddenFromPublic: z.boolean(),
  status: z.enum(["active", "inactive", "out_of_stock"]),
  packQuantity: z.union([z.string(), z.number()]).optional().transform((val) => val ? val.toString() : undefined),
  unitOfMeasure: z.string().optional(),
  unitSize: z.union([z.string(), z.number()]).optional().transform((val) => val ? val.toString() : undefined),
  totalPackageWeight: z.union([z.string(), z.number()]).optional().transform((val) => val ? val.toString() : undefined),
  sellingFormat: z.enum(["units", "pallets", "both"]).optional(),
  unitsPerPallet: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  palletPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  palletMoq: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  palletWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  unitWeight: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
  lowStockThreshold: z.string().optional(),
  shelfLife: z.string().optional(),
  expiryDate: z.string().optional(),
  unit: z.string().optional(),
  deliveryExcluded: z.boolean().optional(),
  temperatureRequirement: z.enum(["ambient", "chilled", "frozen"]).optional(),
  contentCategory: z.enum(["general", "food", "pharmaceuticals", "electronics", "textiles"]).optional(),
  specialHandling: z.object({
    fragile: z.boolean().optional(),
    perishable: z.boolean().optional(),
    hazardous: z.boolean().optional(),
  }).optional(),
  promotionalOffers: z.array(z.unknown()).optional(),
  costPrice: z.union([z.string(), z.number(), z.null()]).optional().transform((val) => val ? val.toString() : ""),
});

export type ProductFormData = z.infer<typeof productFormSchema>;

type ProductWithBatches = Product & {
  batchCount?: number;
  nearestExpiry?: string | null;
};

interface ProductFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingProduct: ProductWithBatches | null;
  initialValues?: Partial<ProductFormData> | null;
  isViewer: boolean;
  navigateBackTo: string | null;
  onNavigateAfterSave: (dest: string) => void;
  onUpgradeRequired: () => void;
  defaultLowStockThreshold?: number;
}

function resizeImage(file: File, maxSizeKB: number = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 600;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX_WIDTH) { height = (height * MAX_WIDTH) / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width = (width * MAX_HEIGHT) / height; height = MAX_HEIGHT; }
      }
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      let quality = 0.9;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxSizeKB * 1024 * 1.33 && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export default function ProductFormDialog({
  open,
  onClose,
  editingProduct,
  initialValues,
  isViewer,
  navigateBackTo,
  onNavigateAfterSave,
  onUpgradeRequired,
  defaultLowStockThreshold = 50,
}: ProductFormDialogProps) {
  const { formatMoney } = useCurrency();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Central, platform-managed category list (shared across product form & storefront).
  const { data: categoryList = [] } = useQuery<{ id: number; name: string; productCount: number }[]>({
    queryKey: ["/api/categories"],
  });
  const categoryNames = categoryList.map((c) => c.name);
  const lastAutoFilledUnitWeight = useRef('');
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Part B: changing the unit price proportionally scales the pallet price.
  // lastPriceRef holds the previous unit price (the ratio's denominator);
  // originalPalletPriceRef is the pallet price when the form opened (for the ▲/▼ note).
  const lastPriceRef = useRef<number | null>(null);
  const originalPalletPriceRef = useRef<number | null>(null);
  // True once the wholesaler types directly into the pallet field — clears the ▲/▼
  // proportional-change note, which only describes an auto-scaled pallet price.
  const [palletManuallyEdited, setPalletManuallyEdited] = useState(false);

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
      hiddenFromPublic: false,
      status: "active",
      packQuantity: "",
      unitOfMeasure: "",
      unitSize: "",
      totalPackageWeight: "",
      unitsPerPallet: "",
      palletPrice: "",
      palletMoq: "",
      palletWeight: "",
      unitWeight: "",
      lowStockThreshold: String(defaultLowStockThreshold),
      shelfLife: "",
      expiryDate: "",
      unit: "units",
      sellingFormat: "units" as "units" | "pallets" | "both",
      deliveryExcluded: false,
      temperatureRequirement: "ambient",
      contentCategory: "general",
      specialHandling: { fragile: false, perishable: false, hazardous: false },
      promotionalOffers: [],
      costPrice: "",
    },
  });

  useEffect(() => {
    if (!open) {
      if (editTimerRef.current) { clearTimeout(editTimerRef.current); editTimerRef.current = null; }
      return;
    }
    if (open && !editingProduct && !initialValues) {
      lastAutoFilledUnitWeight.current = '';
      lastPriceRef.current = null;
      originalPalletPriceRef.current = null;
      setPalletManuallyEdited(false);
      return;
    }
    if (open && !editingProduct && initialValues) {
      lastAutoFilledUnitWeight.current = '';
      form.reset({ ...form.formState.defaultValues, ...initialValues } as Parameters<typeof form.reset>[0]);
      lastPriceRef.current = parseFloat(String((initialValues as any).price ?? '')) || null;
      originalPalletPriceRef.current = parseFloat(String((initialValues as any).palletPrice ?? '')) || null;
      setPalletManuallyEdited(false);
      return;
    }
    if (open && editingProduct) {
      lastAutoFilledUnitWeight.current = '';
      if (editTimerRef.current) clearTimeout(editTimerRef.current);
      editTimerRef.current = setTimeout(() => {
        editTimerRef.current = null;
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
            hiddenFromPublic: Boolean(editingProduct.hiddenFromPublic),
            status: editingProduct.status || "active",
            packQuantity: String(editingProduct.packQuantity || ""),
            unitOfMeasure: editingProduct.unitOfMeasure || "",
            unitSize: (() => {
              const existing = String(editingProduct.unitSize || "");
              if (existing) return existing;
              // Derive from totalPackageWeight ÷ packQuantity when unitSize not stored
              const totalWt = parseFloat(String(editingProduct.totalPackageWeight || ""));
              const qty = parseFloat(String(editingProduct.packQuantity || ""));
              const uom = editingProduct.unitOfMeasure;
              const WEIGHT_TO_KG: Record<string, number> = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 };
              const factor = uom ? WEIGHT_TO_KG[uom] : undefined;
              if (totalWt > 0 && qty > 0 && factor) {
                const unitSizeInUom = (totalWt / qty) / factor;
                return String(Math.round(unitSizeInUom * 1000) / 1000);
              }
              return "";
            })(),
            totalPackageWeight: String(editingProduct.totalPackageWeight || ""),
            unitsPerPallet: String(editingProduct.unitsPerPallet || ""),
            palletPrice: String(editingProduct.palletPrice || ""),
            palletMoq: String(editingProduct.palletMoq || ""),
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
            specialHandling: editingProduct.specialHandling || { fragile: false, perishable: false, hazardous: false },
            promotionalOffers: Array.isArray(editingProduct.promotionalOffers) ? editingProduct.promotionalOffers : [],
            costPrice: String(editingProduct.costPrice || ""),
          };
          form.reset(safeData as Parameters<typeof form.reset>[0]);
          // Baseline for proportional pallet scaling + the ▲/▼ note.
          lastPriceRef.current = parseFloat(safeData.price as string) || null;
          originalPalletPriceRef.current = parseFloat(safeData.palletPrice as string) || null;
          setPalletManuallyEdited(false);
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
            lastAutoFilledUnitWeight.current = safeData.unitWeight || '';
          }
        } catch (error) {
          console.error('Safe form population failed:', error);
        }
      }, 100);
    }
  }, [open, editingProduct, initialValues]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === 'packQuantity' || name === 'unitOfMeasure' || name === 'unitSize') {
        const { packQuantity = '', unitOfMeasure = '', unitSize = '' } = values;
        if (packQuantity && unitOfMeasure && unitSize) {
          const calculatedWeight = computePackWeightKg(packQuantity, unitSize, unitOfMeasure);
          if (calculatedWeight > 0) {
            const currentWeight = form.getValues('totalPackageWeight');
            const newWeight = calculatedWeight.toString();
            if (currentWeight !== newWeight) {
              form.setValue('totalPackageWeight', newWeight, { shouldValidate: false });
              const qty = parseFloat(packQuantity as string) || 1;
              if (qty > 0) {
                const calculatedUnitWeight = Math.round((calculatedWeight / qty) * 1000) / 1000;
                if (calculatedUnitWeight > 0) {
                  const currentUnitWeight = form.getValues('unitWeight');
                  const newUnitWeight = calculatedUnitWeight.toString();
                  const canOverwrite = !currentUnitWeight || currentUnitWeight === lastAutoFilledUnitWeight.current;
                  if (canOverwrite && currentUnitWeight !== newUnitWeight) {
                    form.setValue('unitWeight', newUnitWeight, { shouldValidate: false });
                    lastAutoFilledUnitWeight.current = newUnitWeight;
                  }
                }
              }
              toast({ title: "Weight Auto-Calculated", description: `${calculatedWeight}kg (${packQuantity} × ${unitSize}${unitOfMeasure})`, duration: 2000 });
            }
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, toast]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === 'totalPackageWeight' || name === 'unitsPerPallet') {
        const { totalPackageWeight = '', unitsPerPallet = '' } = values;
        if (totalPackageWeight && unitsPerPallet) {
          const packageWeight = parseFloat(totalPackageWeight);
          const units = parseInt(unitsPerPallet);
          if (packageWeight > 0 && units > 0) {
            const calculatedPalletWeight = Math.round((packageWeight * units) * 1000) / 1000;
            const currentPalletWeight = form.getValues('palletWeight');
            const newPalletWeight = calculatedPalletWeight.toString();
            if (currentPalletWeight !== newPalletWeight) {
              form.setValue('palletWeight', newPalletWeight, { shouldValidate: false });
              toast({ title: "Pallet Weight Auto-Calculated", description: `${calculatedPalletWeight}kg (${units} units × ${packageWeight}kg each)`, duration: 2000 });
            }
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, toast]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== 'totalPackageWeight' && name !== 'packQuantity') return;
      const { totalPackageWeight = '', packQuantity: watchedPackQuantity = '' } = values;
      if (!totalPackageWeight) return;
      const actualPackQuantity = form.getValues('packQuantity') || watchedPackQuantity;
      const pkgWeight = parseFloat(totalPackageWeight);
      const qty = parseFloat(actualPackQuantity as string) || 1;
      if (pkgWeight > 0 && qty > 0) {
        const calculatedUnitWeight = Math.round((pkgWeight / qty) * 1000) / 1000;
        if (calculatedUnitWeight > 0) {
          const currentUnitWeight = form.getValues('unitWeight');
          const newUnitWeight = calculatedUnitWeight.toString();
          const canOverwrite = !currentUnitWeight || currentUnitWeight === lastAutoFilledUnitWeight.current;
          if (canOverwrite && currentUnitWeight !== newUnitWeight) {
            form.setValue('unitWeight', newUnitWeight, { shouldValidate: false });
            lastAutoFilledUnitWeight.current = newUnitWeight;
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Part B: when the unit price changes, scale the pallet price by the same ratio
  // (newPallet = oldPallet × newPrice / oldPrice). The pallet field stays editable —
  // this only fires on a real price edit (name === 'price'), never on form.reset
  // (which fires with name === undefined).
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== 'price') return;
      const newPrice = parseFloat(String(values.price ?? ''));
      const oldPrice = lastPriceRef.current;
      const palletPrice = parseFloat(String(form.getValues('palletPrice') ?? ''));
      if (oldPrice !== null && oldPrice > 0 && newPrice > 0 && palletPrice > 0) {
        const scaled = palletPrice * (newPrice / oldPrice);
        const scaledStr = scaled.toFixed(2);
        if (scaledStr !== String(form.getValues('palletPrice') ?? '')) {
          form.setValue('palletPrice', scaledStr, { shouldValidate: false, shouldDirty: true });
        }
      }
      if (newPrice > 0) lastPriceRef.current = newPrice;
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const generateDescription = async () => {
    try {
      setIsGeneratingDescription(true);
      const productName = form.getValues("name");
      const category = form.getValues("category");
      if (!productName) {
        toast({ title: "Product Name Required", description: "Please enter a product name first", variant: "destructive" });
        return;
      }
      const response = await apiRequest("POST", "/api/ai/generate-description", { productName, category });
      if (response.ok) {
        const data = await response.json();
        const generatedDescription = data.description;
        form.setValue("description", generatedDescription);
        if (generatedDescription.length > 250) {
          toast({ title: "Description Generated (Warning)", description: `Generated description is ${generatedDescription.length} characters. Please trim to 250 characters max.`, variant: "destructive" });
        } else if (generatedDescription.length > 220) {
          toast({ title: "Description Generated", description: `Generated ${generatedDescription.length} characters. Consider keeping under 250 for best results.` });
        } else {
          toast({ title: "Description Generated", description: `Perfect! Generated ${generatedDescription.length} characters within optimal range.` });
        }
        form.trigger("description");
      } else {
        const error = await response.json();
        toast({ title: "Generation Failed", description: error.message || "Failed to generate description", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate description", variant: "destructive" });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, onChange: (value: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    try {
      const resized = await resizeImage(file, 500);
      onChange(resized);
      toast({ title: "Image uploaded", description: "Image optimized and uploaded successfully" });
    } catch {
      toast({ title: "Upload failed", description: "Failed to process image", variant: "destructive" });
    }
  };

  const handleMultipleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, currentImages: string[], onChange: (value: string[]) => void) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (currentImages.length + files.length > 5) {
      toast({ title: "Too many images", description: `You can only upload up to 5 images total. You currently have ${currentImages.length} images.`, variant: "destructive" });
      return;
    }
    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast({ title: "Invalid file type", description: "Please choose only image files.", variant: "destructive" });
      return;
    }
    try {
      toast({ title: "Processing images", description: `Optimizing ${files.length} image(s)...` });
      const processedImages = await Promise.all(files.map(file => resizeImage(file, 500)));
      onChange([...currentImages, ...processedImages]);
      toast({ title: "Images uploaded", description: `${files.length} image(s) optimized and uploaded successfully!` });
    } catch (error) {
      console.error("Image upload error:", error);
      toast({ title: "Upload failed", description: `Failed to process image files: ${error instanceof Error ? error.message : "Unknown error"}`, variant: "destructive" });
    }
  };

  const removeImage = (imageIndex: number, currentImages: string[], onChange: (value: string[]) => void) => {
    onChange(currentImages.filter((_, index) => index !== imageIndex));
  };

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
        palletWeight: data.palletWeight && data.palletWeight !== "" ? parseFloat(data.palletWeight) : null,
        unitWeight: data.unitWeight && data.unitWeight !== "" ? parseFloat(data.unitWeight) : null,
        lowStockThreshold: data.lowStockThreshold ? parseInt(data.lowStockThreshold) : defaultLowStockThreshold,
        shelfLife: data.shelfLife ? parseInt(data.shelfLife) : null,
        costPrice: data.costPrice && data.costPrice !== "" ? parseFloat(data.costPrice) : null,
        promotionalOffers: data.promotionalOffers || [],
      };
      return await apiRequest("POST", "/api/products", productData);
    },
    onSuccess: () => {
      setTimeout(() => form.reset(), 0);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Success", description: "Product created successfully" });
      onClose();
    },
    onError: (error: Error) => {
      if (error.message.includes("403") && error.message.toLowerCase().includes("product limit")) {
        onClose();
        onUpgradeRequired();
      } else {
        let message = "Failed to save product. Please check your inputs and try again.";
        try {
          const parsed = JSON.parse(error.message.replace(/^\d+: /, ''));
          if (parsed.errors?.[0]?.message) message = parsed.errors[0].message;
          else if (parsed.message) message = parsed.message;
        } catch {}
        toast({ title: "Error saving product", description: message, variant: "destructive" });
      }
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (data: ProductFormData & { id: number }) => {
      const { id, ...productData } = data;
      const updatedData: Record<string, any> = {
        ...productData,
        price: parseFloat(productData.price),
        moq: parseInt(productData.moq),
        stock: parseInt(productData.stock),
        unitsPerPallet: productData.unitsPerPallet && productData.unitsPerPallet !== "" ? parseInt(productData.unitsPerPallet) : null,
        palletPrice: productData.palletPrice && productData.palletPrice !== "" ? parseFloat(productData.palletPrice) : null,
        palletMoq: productData.palletMoq && productData.palletMoq !== "" ? parseInt(productData.palletMoq) : null,
        palletWeight: productData.palletWeight && productData.palletWeight !== "" ? parseFloat(productData.palletWeight) : null,
        unitWeight: productData.unitWeight && productData.unitWeight !== "" ? parseFloat(productData.unitWeight) : null,
        lowStockThreshold: productData.lowStockThreshold ? parseInt(productData.lowStockThreshold) : defaultLowStockThreshold,
        shelfLife: productData.shelfLife ? parseInt(productData.shelfLife) : null,
        sellingFormat: productData.sellingFormat || "units",
        costPrice: productData.costPrice && productData.costPrice !== "" ? parseFloat(productData.costPrice) : null,
        promotionalOffers: productData.promotionalOffers || [],
      };
      // Stock is managed exclusively via Manage Stock for batch-tracked products.
      // Strip it from the payload so editing product details never overwrites batch inventory.
      if ((editingProduct?.batchCount ?? 0) > 0) {
        delete updatedData.stock;
      }
      return await apiRequest("PATCH", `/api/products/${id}`, updatedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Saved", description: "Product updated successfully" });
      if (navigateBackTo) {
        onNavigateAfterSave(navigateBackTo);
      }
      onClose();
    },
    onError: (error: Error) => {
      let message = "Failed to update product. Please check your inputs and try again.";
      try {
        const parsed = JSON.parse(error.message.replace(/^\d+: /, ''));
        if (parsed.errors?.[0]?.message) message = parsed.errors[0].message;
        else if (parsed.message) message = parsed.message;
      } catch {}
      toast({ title: "Error updating product", description: message, variant: "destructive" });
    },
  });

  const onSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProductMutation.mutate({ ...data, id: editingProduct.id });
    } else {
      createProductMutation.mutate(data);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
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
                render={({ field }) => {
                  const isDiscontinued = field.value && !categoryNames.includes(field.value);
                  return (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger className={isDiscontinued ? "border-amber-400" : undefined}>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isDiscontinued && (
                            <SelectItem key={field.value} value={field.value} className="text-amber-600">
                              {field.value} (discontinued)
                            </SelectItem>
                          )}
                          {categoryNames.map((category) => (
                            <SelectItem key={category} value={category}>{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isDiscontinued && (
                        <FormDescription className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          This category is no longer available. Please select a current category.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
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
                    <Textarea placeholder="Short punchy summary (max 250 characters)" maxLength={250} {...field} />
                  </FormControl>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-500">Short punchy summary</span>
                    <span className={
                      (field.value?.length || 0) > 250
                        ? "text-red-600 font-medium"
                        : (field.value?.length || 0) > 220
                          ? "text-amber-600 font-medium"
                          : "text-gray-500"
                    }>
                      {field.value?.length || 0}/250
                      {(field.value?.length || 0) > 250 && (
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                    <FormLabel>Opening Stock</FormLabel>
                    {(editingProduct?.batchCount ?? 0) > 0 ? (
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-700">{field.value || 0}</span>
                        <p className="text-xs text-gray-400 mt-0.5">Managed by batches — use Manage Stock to adjust</p>
                      </div>
                    ) : (
                      <>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <p className="text-xs text-gray-400 mt-1">How many units you have right now. This sets the starting point for your stock history.</p>
                      </>
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
                    <Input type="number" placeholder={String(defaultLowStockThreshold)} {...field} />
                  </FormControl>
                  <p className="text-xs text-gray-500 mt-1">
                    Overrides the default for this product only. Leave blank to fall back to your account default (currently {defaultLowStockThreshold} units — set in Settings → Notifications).
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
                  {(editingProduct?.batchCount ?? 0) > 0 ? (
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <span className="text-sm font-medium text-gray-700">
                        {editingProduct?.nearestExpiry
                          ? new Date(editingProduct?.nearestExpiry ?? '').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
                                field.onChange([...(field.value || []), url]);
                                input.value = '';
                              } else if ((field.value?.length || 0) >= 5) {
                                toast({ title: "Maximum images reached", description: "You can only have up to 5 images per product.", variant: "destructive" });
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
                              <img src={imageUrl} alt={`Product image ${index + 1}`} className="h-20 w-20 object-cover rounded-lg border" />
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
                                <Badge className="absolute -bottom-2 left-0 text-xs bg-blue-500">Primary</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-sm text-gray-600">
                        Upload up to 5 images or paste image URLs. First image will be the primary display image. Images are automatically optimized.
                      </p>
                      {(field.value?.length || 0) > 0 && (
                        <p className="text-sm text-blue-600">{field.value?.length || 0}/5 images uploaded</p>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Unit Configuration & Weight */}
            <div className="space-y-4">
              <div>
                <FormLabel className="text-base">📦 Product Unit Configuration & Weight</FormLabel>
                <div className="text-sm text-muted-foreground mb-3">
                  Configure packaging, measurements, and weight for accurate shipping calculations
                </div>
              </div>
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
                          <Input type="number" placeholder="e.g., 24" {...field} onChange={(e) => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                        <div className="text-xs text-muted-foreground">Number per pack (optional)</div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unitOfMeasure"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit of Measure</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {["Weight", "Volume", "Count", "Packaging"].map((category) => (
                              <div key={category}>
                                <div className="px-2 py-1 text-xs font-medium text-muted-foreground bg-muted">{category}</div>
                                {BASE_UNITS.filter(unit => unit.category === category).map((unit) => (
                                  <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                        <div className="text-xs text-muted-foreground">Base unit (ml, g, pieces, etc.)</div>
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
                          <Input type="number" step="0.001" placeholder="e.g., 250" {...field} onChange={(e) => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                        <div className="text-xs text-muted-foreground">Amount per unit (e.g., 250ml)</div>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          {field.value ? `Auto-calculated: ${field.value}kg` : 'Complete unit config above for auto-calculation'}
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
                          <Input type="number" step="0.001" placeholder="e.g. 2.5" {...field} onChange={(e) => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                        <div className="text-xs text-muted-foreground">Auto-calculated from Total Package Weight ÷ Quantity in Pack</div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Pallet Configuration */}
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
                        <Input type="number" placeholder="e.g., 48" {...field} onChange={(e) => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                      <div className="text-xs text-muted-foreground">How many cases/packages per pallet</div>
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
                    const unitPrice = palletPriceNum > 0 && unitsPerPalletNum > 0 ? palletPriceNum / unitsPerPalletNum : null;
                    const currency = form.watch("currency") || "GBP";
                    // ▲/▼ change vs the pallet price when the form opened (Part B note).
                    const origPallet = originalPalletPriceRef.current;
                    const palletPct = origPallet && origPallet > 0 && palletPriceNum > 0
                      ? ((palletPriceNum - origPallet) / origPallet) * 100 : null;
                    return (
                      <FormItem>
                        <FormLabel>Pallet Price ({currency})</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="e.g., 240.00" {...field} onChange={(e) => { field.onChange(e.target.value); setPalletManuallyEdited(true); }} />
                        </FormControl>
                        <FormMessage />
                        <div className="text-xs text-muted-foreground">
                          {unitPrice !== null ? (
                            <>Total price for full pallet &mdash; <span className="font-medium text-orange-700">{formatMoney(unitPrice)} per unit</span></>
                          ) : "Total price for full pallet"}
                          {palletPct !== null && Math.abs(palletPct) >= 0.5 && !palletManuallyEdited && (
                            <span className={`ml-1 font-medium ${palletPct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {palletPct > 0 ? '▲' : '▼'} {Math.abs(palletPct).toFixed(0)}%
                            </span>
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
                        <Input type="number" placeholder="e.g., 1" {...field} onChange={(e) => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                      <div className="text-xs text-muted-foreground">Minimum pallet order quantity</div>
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  const stockVal = parseInt(form.watch("stock") || "0") || 0;
                  const qip = parseInt(form.watch("quantityInPack") || "1") || 1;
                  const upp = parseInt(form.watch("unitsPerPallet") || "0") || 0;
                  const derived = upp > 0 ? Math.floor(Math.floor(stockVal / qip) / upp) : null;
                  return (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Pallet Stock</p>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 min-h-[38px] flex items-center">
                        {derived !== null ? (
                          <span className="text-sm font-semibold text-green-700">{derived} pallets</span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </div>
                      {derived !== null ? (
                        <p className="text-xs text-muted-foreground">
                          {stockVal} units ÷ {upp} per pallet = <strong>{derived} pallets</strong>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Set Units Per Pallet above to see available pallets</p>
                      )}
                      <p className="text-xs text-gray-400">Calculated automatically — update Opening Stock to change this</p>
                    </div>
                  );
                })()}
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
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sellingFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Format</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
              <FormField
                control={form.control}
                name="hiddenFromPublic"
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
                      <FormLabel>Hide from Public Store</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Approved customers can still see this product
                      </div>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Shipping Requirements */}
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
                      <div className="text-xs text-muted-foreground">Required temperature for delivery</div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contentCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
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
                      <div className="text-xs text-muted-foreground">Product type for shipping requirements</div>
                    </FormItem>
                  )}
                />
              </div>
              <div>
                <FormLabel className="text-sm font-medium">Special Handling Requirements</FormLabel>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  {(["fragile", "perishable", "hazardous"] as const).map((key) => (
                    <FormField
                      key={key}
                      control={form.control}
                      name={`specialHandling.${key}`}
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
                            {key === "fragile" ? "📦 Fragile" : key === "perishable" ? "⏰ Perishable" : "⚠️ Hazardous"}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 mt-6">
              <Button type="button" variant="outline" onClick={onClose}>
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
  );
}
