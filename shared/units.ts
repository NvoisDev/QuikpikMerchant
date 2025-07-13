// Comprehensive units system for wholesale products

export interface UnitDefinition {
  value: string;
  label: string;
  category: string;
  baseWeightKg?: number; // For automatic weight calculation
  commonFormats?: string[]; // Common display formats
}

export const UNIT_CATEGORIES = {
  WEIGHT: "Weight",
  VOLUME: "Volume", 
  COUNT: "Count/Pieces",
  PACKAGING: "Packaging"
} as const;

export const UNITS: UnitDefinition[] = [
  // Weight units
  { 
    value: "kg", 
    label: "Kilograms (kg)", 
    category: UNIT_CATEGORIES.WEIGHT, 
    baseWeightKg: 1,
    commonFormats: ["1kg", "5kg", "10kg", "25kg"]
  },
  { 
    value: "g", 
    label: "Grams (g)", 
    category: UNIT_CATEGORIES.WEIGHT, 
    baseWeightKg: 0.001,
    commonFormats: ["100g", "250g", "500g", "12 x 24g", "24 x 50g"]
  },
  { 
    value: "tonnes", 
    label: "Tonnes (t)", 
    category: UNIT_CATEGORIES.WEIGHT, 
    baseWeightKg: 1000,
    commonFormats: ["1t", "2t", "5t"]
  },

  // Volume units
  { 
    value: "l", 
    label: "Litres (L)", 
    category: UNIT_CATEGORIES.VOLUME,
    baseWeightKg: 1, // Approximate for water-based liquids
    commonFormats: ["1L", "2L", "5L", "6 x 2L", "12 x 1L"]
  },
  { 
    value: "ml", 
    label: "Millilitres (mL)", 
    category: UNIT_CATEGORIES.VOLUME,
    baseWeightKg: 0.001,
    commonFormats: ["250ml", "500ml", "12 x 330ml", "24 x 500ml", "6 x 750ml"]
  },
  { 
    value: "cl", 
    label: "Centilitres (cL)", 
    category: UNIT_CATEGORIES.VOLUME,
    baseWeightKg: 0.01,
    commonFormats: ["33cl", "50cl", "12 x 33cl", "24 x 25cl", "6 x 75cl"]
  },

  // Count/Pieces
  { 
    value: "pieces", 
    label: "Pieces", 
    category: UNIT_CATEGORIES.COUNT,
    commonFormats: ["1 piece", "12 pieces", "24 pieces", "100 pieces"]
  },
  { 
    value: "units", 
    label: "Units", 
    category: UNIT_CATEGORIES.COUNT,
    commonFormats: ["1 unit", "10 units", "50 units", "100 units"]
  },
  { 
    value: "pairs", 
    label: "Pairs", 
    category: UNIT_CATEGORIES.COUNT,
    commonFormats: ["1 pair", "12 pairs", "24 pairs", "50 pairs"]
  },

  // Packaging
  { 
    value: "boxes", 
    label: "Boxes", 
    category: UNIT_CATEGORIES.PACKAGING,
    commonFormats: ["1 box", "6 boxes", "12 boxes", "24 boxes"]
  },
  { 
    value: "cases", 
    label: "Cases", 
    category: UNIT_CATEGORIES.PACKAGING,
    commonFormats: ["1 case", "6 cases", "12 cases"]
  },
  { 
    value: "cartons", 
    label: "Cartons", 
    category: UNIT_CATEGORIES.PACKAGING,
    commonFormats: ["1 carton", "12 cartons", "24 cartons"]
  },
  { 
    value: "packs", 
    label: "Packs", 
    category: UNIT_CATEGORIES.PACKAGING,
    commonFormats: ["1 pack", "6 packs", "12 packs", "24 packs"]
  },
  { 
    value: "bundles", 
    label: "Bundles", 
    category: UNIT_CATEGORIES.PACKAGING,
    commonFormats: ["1 bundle", "6 bundles", "12 bundles"]
  },
  { 
    value: "rolls", 
    label: "Rolls", 
    category: UNIT_CATEGORIES.PACKAGING,
    commonFormats: ["1 roll", "6 rolls", "12 rolls", "24 rolls"]
  }
];

// Base units of measure for the flexible system
export const BASE_UNITS = [
  // Weight
  { value: "kg", label: "kg", category: "Weight" },
  { value: "g", label: "g", category: "Weight" },
  { value: "tonnes", label: "tonnes", category: "Weight" },
  
  // Volume  
  { value: "l", label: "L", category: "Volume" },
  { value: "ml", label: "mL", category: "Volume" },
  { value: "cl", label: "cL", category: "Volume" },
  
  // Count
  { value: "pieces", label: "pieces", category: "Count" },
  { value: "units", label: "units", category: "Count" },
  { value: "pairs", label: "pairs", category: "Count" },
  
  // Packaging
  { value: "boxes", label: "boxes", category: "Packaging" },
  { value: "cases", label: "cases", category: "Packaging" },
  { value: "cartons", label: "cartons", category: "Packaging" },
  { value: "packs", label: "packs", category: "Packaging" },
  { value: "bundles", label: "bundles", category: "Packaging" },
  { value: "rolls", label: "rolls", category: "Packaging" }
];

// Common wholesale format patterns (kept for backward compatibility)
export const COMMON_WHOLESALE_FORMATS = [
  "12 x 24g",
  "12 x 330ml", 
  "12 x 500ml",
  "24 x 330ml",
  "24 x 500ml",
  "24 x 250ml", // Added the one you mentioned
  "6 x 2L",
  "12 x 1L",
  "6 x 750ml",
  "12 x 33cl",
  "24 x 25cl",
  "12 x 50g",
  "24 x 50g",
  "6 x 1kg",
  "12 x 500g",
  "24 pieces",
  "50 pieces",
  "100 pieces",
  "12 pairs",
  "24 pairs",
  "6 packs",
  "12 packs",
  "24 packs"
];

export function getUnitByValue(value: string): UnitDefinition | undefined {
  return UNITS.find(unit => unit.value === value);
}

export function getUnitsByCategory(category: string): UnitDefinition[] {
  return UNITS.filter(unit => unit.category === category);
}

export function formatUnitDisplay(quantity: number, unit: string, unitFormat?: string): string {
  if (unitFormat) {
    // If we have a custom format like "12 x 24g", use it with quantity
    return `${quantity} ${unitFormat}`;
  }
  
  const unitDef = getUnitByValue(unit);
  if (!unitDef) return `${quantity} ${unit}`;
  
  // For standard units, show quantity + unit symbol
  const unitSymbol = unit === "pieces" ? (quantity === 1 ? "piece" : "pieces") :
                     unit === "units" ? (quantity === 1 ? "unit" : "units") :
                     unit === "pairs" ? (quantity === 1 ? "pair" : "pairs") :
                     unit;
  
  return `${quantity} ${unitSymbol}`;
}

export function calculateWeightFromUnit(quantity: number, unit: string, unitWeight?: number): number {
  if (unitWeight) return quantity * unitWeight;
  
  const unitDef = getUnitByValue(unit);
  if (!unitDef?.baseWeightKg) return 0;
  
  return quantity * unitDef.baseWeightKg;
}