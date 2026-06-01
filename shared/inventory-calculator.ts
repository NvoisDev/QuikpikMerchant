/**
 * Core Inventory Logic Calculator
 * 
 * Following the Base Unit Inventory specification:
 * - Single source of truth: baseUnitStock (total number of base units)
 * - All other quantities are derived calculations
 * - Conversion factors: quantityInPack, unitsPerPallet
 */
import { formatNumber } from './utils/currency';

export interface ProductInventoryData {
  stock: number;                 // Individual units stock
  palletStock: number;          // Pallet stock
  quantityInPack: number;       // Base units per pack
  unitsPerPallet: number;       // Number of PACKS per pallet (not base units)
  baseUnitStock?: number;       // Optional alias for total base unit stock
}

export interface DerivedInventoryCalculations {
  totalBaseUnits: number;        // Source of truth
  availablePacks: number;        // Calculated: baseUnitStock / quantityInPack
  availablePallets: number;      // Calculated: availablePacks / unitsPerPallet
  baseUnitsPerPallet: number;    // Calculated: quantityInPack * unitsPerPallet
}

export interface OrderDecrement {
  baseUnitsToSubtract: number;   // Amount to subtract from baseUnitStock
  orderType: 'units' | 'packs' | 'pallets';
  quantity: number;              // Original order quantity
  conversionDetails: string;     // Human-readable conversion explanation
}

export class InventoryCalculator {
  
  /**
   * Calculate derived inventory values from base unit stock
   */
  static calculateDerivedInventory(data: ProductInventoryData): DerivedInventoryCalculations {
    const { quantityInPack, unitsPerPallet } = data;
    const baseUnitStock = data.baseUnitStock ?? data.stock;
    
    // Validate inputs
    if (quantityInPack <= 0 || unitsPerPallet <= 0) {
      throw new Error('quantityInPack and unitsPerPallet must be positive integers');
    }
    
    const availablePacks = Math.floor(baseUnitStock / quantityInPack);
    const availablePallets = Math.floor(availablePacks / unitsPerPallet);
    const baseUnitsPerPallet = quantityInPack * unitsPerPallet;
    
    return {
      totalBaseUnits: baseUnitStock,
      availablePacks,
      availablePallets,
      baseUnitsPerPallet
    };
  }
  
  /**
   * Calculate how many base units to subtract for an order
   */
  static calculateOrderDecrement(
    orderQuantity: number, 
    sellingType: 'units' | 'pallets', 
    data: ProductInventoryData
  ): OrderDecrement {
    const { quantityInPack, unitsPerPallet } = data;
    
    let baseUnitsToSubtract: number;
    let conversionDetails: string;
    
    if (sellingType === 'units') {
      // Direct base unit order
      baseUnitsToSubtract = orderQuantity;
      conversionDetails = `${orderQuantity} base units`;
    } else if (sellingType === 'pallets') {
      // Pallet order: quantity * packs per pallet * base units per pack
      baseUnitsToSubtract = orderQuantity * unitsPerPallet * quantityInPack;
      conversionDetails = `${orderQuantity} pallets × ${unitsPerPallet} packs/pallet × ${quantityInPack} units/pack = ${baseUnitsToSubtract} base units`;
    } else {
      throw new Error(`Unsupported selling type: ${sellingType}`);
    }
    
    return {
      baseUnitsToSubtract,
      orderType: sellingType,
      quantity: orderQuantity,
      conversionDetails
    };
  }
  
  /**
   * Validate if an order can be fulfilled with current stock
   */
  static canFulfillOrder(
    orderQuantity: number,
    sellingType: 'units' | 'pallets',
    data: ProductInventoryData
  ): { canFulfill: boolean; reason?: string; available: number } {
    const decrement = this.calculateOrderDecrement(orderQuantity, sellingType, data);
    const derived = this.calculateDerivedInventory(data);
    
    const baseUnitStock = data.baseUnitStock ?? data.stock;
    if (decrement.baseUnitsToSubtract > baseUnitStock) {
      let availableQuantity: number;
      
      if (sellingType === 'units') {
        availableQuantity = baseUnitStock;
      } else if (sellingType === 'pallets') {
        availableQuantity = derived.availablePallets;
      } else {
        availableQuantity = 0;
      }
      
      return {
        canFulfill: false,
        reason: `Insufficient stock. Requested: ${orderQuantity} ${sellingType}, Available: ${availableQuantity} ${sellingType}`,
        available: availableQuantity
      };
    }
    
    return { canFulfill: true, available: orderQuantity };
  }
  
  /**
   * Process an order and return new stock levels after decrement
   * SEPARATE STOCK TRACKING: Units reduce unit stock, Pallets reduce pallet stock
   */
  static processOrder(
    orderQuantity: number,
    sellingType: 'units' | 'pallets',
    currentData: ProductInventoryData
  ): { newUnitStock: number; newPalletStock: number; decrementInfo: OrderDecrement } {
    // Validate stock availability
    if (sellingType === 'units') {
      if (orderQuantity > (currentData.stock || 0)) {
        throw new Error(`Insufficient stock. Requested: ${orderQuantity} units, Available: ${currentData.stock || 0} units`);
      }
    } else if (sellingType === 'pallets') {
      if (orderQuantity > (currentData.palletStock || 0)) {
        throw new Error(`Insufficient stock. Requested: ${orderQuantity} pallets, Available: ${currentData.palletStock || 0} pallets`);
      }
    }
    
    const decrementInfo = this.calculateOrderDecrement(orderQuantity, sellingType, currentData);
    
    // SEPARATE STOCK TRACKING
    let newUnitStock = currentData.stock || 0;
    let newPalletStock = currentData.palletStock || 0;
    
    if (sellingType === 'units') {
      newUnitStock = (currentData.stock || 0) - orderQuantity;
    } else if (sellingType === 'pallets') {
      newPalletStock = (currentData.palletStock || 0) - orderQuantity;
    }
    
    return {
      newUnitStock,
      newPalletStock,
      decrementInfo
    };
  }
  
  /**
   * Format stock as a human-readable breakdown of pallets, packs, and remaining units.
   * Returns null when no conversion factors are configured (quantityInPack must be > 0).
   * Gracefully degrades: if only quantityInPack is set (no pallet info), shows packs + units only.
   */
  static formatStockBreakdown(
    baseUnitStock: number,
    quantityInPack: number | null | undefined,
    unitsPerPallet: number | null | undefined
  ): { pallets: number; packs: number; units: number; label: string } | null {
    const qip = quantityInPack && quantityInPack > 0 ? quantityInPack : null;
    const upp = unitsPerPallet && unitsPerPallet > 0 ? unitsPerPallet : null;

    if (!qip) return null;

    const totalPacks = Math.floor(baseUnitStock / qip);
    const remainingUnits = baseUnitStock % qip;

    if (!upp) {
      const parts: string[] = [];
      if (totalPacks > 0) parts.push(`${formatNumber(totalPacks)} pack${totalPacks !== 1 ? 's' : ''}`);
      if (remainingUnits > 0 || totalPacks === 0) parts.push(`${formatNumber(remainingUnits)} unit${remainingUnits !== 1 ? 's' : ''}`);
      return { pallets: 0, packs: totalPacks, units: remainingUnits, label: parts.join(' · ') };
    }

    const pallets = Math.floor(totalPacks / upp);
    const remainingPacks = totalPacks % upp;

    const parts: string[] = [];
    if (pallets > 0) parts.push(`${formatNumber(pallets)} pallet${pallets !== 1 ? 's' : ''}`);
    if (remainingPacks > 0) parts.push(`${formatNumber(remainingPacks)} pack${remainingPacks !== 1 ? 's' : ''}`);
    if (remainingUnits > 0 || (pallets === 0 && remainingPacks === 0)) {
      parts.push(`${formatNumber(remainingUnits)} unit${remainingUnits !== 1 ? 's' : ''}`);
    }

    return { pallets, packs: remainingPacks, units: remainingUnits, label: parts.join(' · ') };
  }

  /**
   * Helper to format inventory display for UI
   */
  static formatInventoryDisplay(data: ProductInventoryData): {
    baseUnits: string;
    packs: string;
    pallets: string;
    details: string;
  } {
    const derived = this.calculateDerivedInventory(data);
    
    return {
      baseUnits: `${formatNumber(derived.totalBaseUnits)} units`,
      packs: `${formatNumber(derived.availablePacks)} packs (${data.quantityInPack} units each)`,
      pallets: `${formatNumber(derived.availablePallets)} pallets (${derived.baseUnitsPerPallet} units each)`,
      details: `${formatNumber(derived.totalBaseUnits)} base units = ${derived.availablePacks} packs = ${derived.availablePallets} pallets`
    };
  }
}