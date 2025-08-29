/**
 * Core Inventory Logic Calculator
 * 
 * Following the Base Unit Inventory specification:
 * - Single source of truth: baseUnitStock (total number of base units)
 * - All other quantities are derived calculations
 * - Conversion factors: quantityInPack, unitsPerPallet
 */

export interface ProductInventoryData {
  stock: number;                 // Individual units stock
  palletStock: number;          // Pallet stock
  quantityInPack: number;       // Base units per pack
  unitsPerPallet: number;       // Number of PACKS per pallet (not base units)
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
    const { baseUnitStock, quantityInPack, unitsPerPallet } = data;
    
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
    
    if (decrement.baseUnitsToSubtract > data.baseUnitStock) {
      let availableQuantity: number;
      
      if (sellingType === 'units') {
        availableQuantity = data.baseUnitStock;
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
      baseUnits: `${derived.totalBaseUnits.toLocaleString()} units`,
      packs: `${derived.availablePacks.toLocaleString()} packs (${data.quantityInPack} units each)`,
      pallets: `${derived.availablePallets.toLocaleString()} pallets (${derived.baseUnitsPerPallet} units each)`,
      details: `${derived.totalBaseUnits.toLocaleString()} base units = ${derived.availablePacks} packs = ${derived.availablePallets} pallets`
    };
  }
}