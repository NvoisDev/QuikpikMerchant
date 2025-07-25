/**
 * Precise Shipping Calculator using Product Unit Configuration
 * Replaces basic weight estimates with accurate calculations based on flexible unit system
 */

interface ProductUnitConfig {
  packQuantity?: number;
  unitOfMeasure?: string;
  unitSize?: number;  // Use unitSize to match database field
  sizePerUnit?: number;  // Keep as fallback for backward compatibility
  individualUnitWeight?: number;
  totalPackageWeight?: number;
  packageDimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
}

interface PreciseParcel {
  weight: number; // kg
  length: number; // cm
  width: number; // cm
  height: number; // cm
  value: number; // GBP
}

export class PreciseShippingCalculator {
  /**
   * Calculate precise weight from product unit configuration
   */
  static calculatePackageWeight(config: ProductUnitConfig, quantity: number = 1): number {
    // If total package weight is already calculated, use it
    if (config.totalPackageWeight && config.totalPackageWeight > 0) {
      return config.totalPackageWeight * quantity;
    }

    // Calculate based on unit configuration
    if (config.packQuantity && config.unitOfMeasure && (config.unitSize || config.sizePerUnit)) {
      const { packQuantity, unitOfMeasure } = config;
      const sizePerUnit = config.unitSize || config.sizePerUnit || 0;
      
      let weightPerPackage = 0;

      switch (unitOfMeasure.toLowerCase()) {
        case 'g':
        case 'grams':
          // Convert grams to kg
          weightPerPackage = (packQuantity * unitSize) / 1000;
          break;
          
        case 'kg':
        case 'kilograms':
          weightPerPackage = packQuantity * unitSize;
          break;
          
        case 'ml':
        case 'millilitres':
          // Assume density of 1g/ml for liquids (water-based products)
          weightPerPackage = (packQuantity * unitSize) / 1000;
          break;
          
        case 'l':
        case 'litres':
          // Assume density of 1kg/l
          weightPerPackage = packQuantity * unitSize;
          break;
          
        case 'cl':
        case 'centilitres':
          // Convert cl to kg (assume 1g/ml density)
          weightPerPackage = (packQuantity * unitSize) / 100;
          break;
          
        case 'pieces':
        case 'units':
        case 'cans':
        case 'bottles':
          // Use individual unit weight if available, otherwise estimate
          if (config.individualUnitWeight && config.individualUnitWeight > 0) {
            weightPerPackage = packQuantity * config.individualUnitWeight;
          } else {
            // Estimate based on typical weights for different product types
            const estimatedUnitWeight = this.estimateUnitWeight(unitOfMeasure, unitSize);
            weightPerPackage = packQuantity * estimatedUnitWeight;
          }
          break;
          
        default:
          // Fallback to individual unit weight or basic estimate
          if (config.individualUnitWeight && config.individualUnitWeight > 0) {
            weightPerPackage = packQuantity * config.individualUnitWeight;
          } else {
            weightPerPackage = packQuantity * 0.1; // 100g per unit fallback
          }
      }

      return Math.max(0.1, weightPerPackage * quantity); // Minimum 100g
    }

    // Final fallback
    return Math.max(0.1, quantity * 0.5); // 500g per item fallback
  }

  /**
   * Estimate unit weight based on unit type and size
   */
  private static estimateUnitWeight(unitType: string, size: number): number {
    switch (unitType.toLowerCase()) {
      case 'cans':
        // Typical can weights: 330ml = 350g, 500ml = 520g
        return size > 400 ? 0.52 : 0.35;
        
      case 'bottles':
        // Glass bottles are heavier than cans
        return size > 500 ? 0.8 : 0.5;
        
      case 'pieces':
      case 'units':
        // General pieces - depends on size indication
        if (size > 1000) return 1.0; // Large items
        if (size > 500) return 0.5;  // Medium items
        return 0.2; // Small items
        
      default:
        return 0.1; // 100g default
    }
  }

  /**
   * Calculate package dimensions based on configuration
   */
  static calculatePackageDimensions(config: ProductUnitConfig, quantity: number = 1): { length: number; width: number; height: number } {
    // Use configured dimensions if available
    if (config.packageDimensions && 
        config.packageDimensions.length && 
        config.packageDimensions.width && 
        config.packageDimensions.height) {
      return {
        length: config.packageDimensions.length,
        width: config.packageDimensions.width,
        height: config.packageDimensions.height * Math.ceil(quantity / (config.packQuantity || 1))
      };
    }

    // Calculate based on unit configuration  
    if (config.packQuantity && config.unitOfMeasure && (config.unitSize || config.sizePerUnit)) {
      const { packQuantity, unitOfMeasure } = config;
      const unitSize = config.unitSize || config.sizePerUnit || 0;
      
      // Estimate dimensions based on product type and size
      let baseDimensions = this.estimateBaseDimensions(unitOfMeasure, unitSize, packQuantity);
      
      // Adjust for quantity
      const packages = Math.ceil(quantity / packQuantity);
      
      return {
        length: baseDimensions.length,
        width: baseDimensions.width,
        height: baseDimensions.height * packages
      };
    }

    // Default dimensions for unknown products
    return {
      length: 30,
      width: 20,
      height: 15 * quantity
    };
  }

  /**
   * Estimate base package dimensions
   */
  private static estimateBaseDimensions(unitType: string, size: number, packQuantity: number): { length: number; width: number; height: number } {
    switch (unitType.toLowerCase()) {
      case 'cans':
        // Typical can packaging
        const cansPerRow = Math.min(4, Math.ceil(Math.sqrt(packQuantity)));
        const rows = Math.ceil(packQuantity / cansPerRow);
        return {
          length: cansPerRow * 7, // 7cm per can
          width: rows * 7,
          height: size > 400 ? 12 : 10 // Can height
        };
        
      case 'bottles':
        // Bottle packaging
        const bottlesPerRow = Math.min(3, Math.ceil(Math.sqrt(packQuantity)));
        const bottleRows = Math.ceil(packQuantity / bottlesPerRow);
        return {
          length: bottlesPerRow * 8,
          width: bottleRows * 8,
          height: size > 750 ? 32 : 25 // Bottle height
        };
        
      case 'g':
      case 'kg':
        // Food products in boxes/bags
        return {
          length: Math.min(40, 20 + packQuantity * 2),
          width: Math.min(30, 15 + packQuantity * 1.5),
          height: Math.min(25, 10 + packQuantity * 1)
        };
        
      case 'ml':
      case 'l':
      case 'cl':
        // Liquid containers
        return {
          length: Math.min(35, 15 + packQuantity * 2),
          width: Math.min(25, 15 + packQuantity * 1),
          height: Math.min(30, 12 + packQuantity * 1.5)
        };
        
      default:
        // General packaging
        return {
          length: 30,
          width: 20,
          height: 15
        };
    }
  }

  /**
   * Create precise parcel for shipping quotes
   */
  static createPreciseParcel(cartItems: any[]): PreciseParcel[] {
    const parcels: PreciseParcel[] = [];
    let currentParcel: PreciseParcel | null = null;
    
    for (const item of cartItems) {
      const config: ProductUnitConfig = {
        packQuantity: item.product?.packQuantity,
        unitOfMeasure: item.product?.unitOfMeasure,
        unitSize: item.product?.unitSize,  // Fixed: use unitSize to match database field
        sizePerUnit: item.product?.sizePerUnit,  // Keep as fallback
        individualUnitWeight: item.product?.individualUnitWeight,
        totalPackageWeight: item.product?.totalPackageWeight,
        packageDimensions: item.product?.packageDimensions
      };

      const itemWeight = this.calculatePackageWeight(config, parseInt(item.quantity));
      const itemDimensions = this.calculatePackageDimensions(config, parseInt(item.quantity));
      const itemValue = parseFloat(item.unitPrice) * parseInt(item.quantity);

      // Check if we can add to current parcel (max 30kg per parcel for most services)
      if (!currentParcel || (currentParcel.weight + itemWeight) > 30) {
        // Start new parcel
        currentParcel = {
          weight: itemWeight,
          length: itemDimensions.length,
          width: itemDimensions.width,
          height: itemDimensions.height,
          value: itemValue
        };
        parcels.push(currentParcel);
      } else {
        // Add to current parcel
        currentParcel.weight += itemWeight;
        currentParcel.value += itemValue;
        // Adjust dimensions for combined items
        currentParcel.height = Math.max(currentParcel.height, itemDimensions.height);
        currentParcel.length = Math.max(currentParcel.length, itemDimensions.length);
        currentParcel.width = Math.max(currentParcel.width, itemDimensions.width);
      }
    }

    // Ensure minimum dimensions and weights
    return parcels.map(parcel => ({
      weight: Math.max(0.1, Math.round(parcel.weight * 1000) / 1000), // Round to 3 decimal places, min 100g
      length: Math.max(10, Math.round(parcel.length)),
      width: Math.max(10, Math.round(parcel.width)),
      height: Math.max(5, Math.round(parcel.height)),
      value: Math.round(parcel.value * 100) / 100 // Round to 2 decimal places
    }));
  }

  /**
   * Get shipping service recommendations based on total weight
   */
  static getServiceRecommendations(totalWeight: number): { 
    maxServices: string[];
    warnings: string[];
    requirements: string[];
  } {
    const recommendations = {
      maxServices: [] as string[],
      warnings: [] as string[],
      requirements: [] as string[]
    };

    if (totalWeight <= 2) {
      recommendations.maxServices = ['Royal Mail 1st Class', 'Royal Mail 2nd Class', 'Royal Mail 48', 'DPD Local'];
    } else if (totalWeight <= 20) {
      recommendations.maxServices = ['Royal Mail 48', 'DPD Local', 'DPD Next Day', 'Evri Standard'];
    } else if (totalWeight <= 30) {
      recommendations.maxServices = ['DPD Local', 'DPD Next Day', 'Evri Standard', 'UPS Standard'];
      recommendations.warnings.push('Limited to courier services due to weight');
    } else if (totalWeight <= 70) {
      recommendations.maxServices = ['DPD Express', 'UPS Express', 'TNT Express'];
      recommendations.warnings.push('Heavy parcel - courier services only');
      recommendations.requirements.push('May require special handling');
    } else {
      recommendations.maxServices = ['Pallet Freight', 'Express Pallet'];
      recommendations.warnings.push('Requires pallet freight service');
      recommendations.requirements.push('Forklift access required at delivery location');
    }

    return recommendations;
  }
}