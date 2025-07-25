export class PreciseShippingCalculator {
  /**
   * Create precise parcel data from cart items using unit configuration
   */
  static createPreciseParcel(cartItems: any[]) {
    return cartItems.map(item => {
      const product = item.product || {};
      const quantity = item.quantity || 1;
      
      // Use unitSize field (from database) with fallback to sizePerUnit
      const unitSize = parseFloat(product.unitSize || product.sizePerUnit || '0');
      const packQuantity = parseInt(product.packQuantity || '1');
      const unitOfMeasure = product.unitOfMeasure || 'kg';
      
      // Calculate weight based on unit configuration
      let weight = 0;
      if (unitOfMeasure === 'g' || unitOfMeasure === 'ml') {
        // Convert grams/ml to kg (assuming 1ml = 1g density)
        weight = (unitSize * packQuantity * quantity) / 1000;
      } else if (unitOfMeasure === 'kg' || unitOfMeasure === 'l') {
        // Already in kg/l
        weight = unitSize * packQuantity * quantity;
      } else {
        // For pieces, cans, bottles, etc. - use estimated weight
        weight = packQuantity * quantity * 0.25; // 250g per unit estimate
      }
      
      // Ensure minimum weight
      weight = Math.max(weight, 0.1);
      
      const dimensions = this.calculatePackageDimensions(product, quantity);
      
      return {
        weight: parseFloat(weight.toFixed(3)),
        length: dimensions.length,
        width: dimensions.width,
        height: dimensions.height,
        contents: product.name || 'Product'
      };
    });
  }
  
  /**
   * Calculate package dimensions based on product type and quantity
   */
  static calculatePackageDimensions(product: any, quantity: number) {
    const packQuantity = parseInt(product.packQuantity || '1');
    const totalUnits = packQuantity * quantity;
    
    // Base dimensions for different product types
    let baseDimensions = { length: 20, width: 15, height: 10 }; // cm
    
    // Adjust based on unit of measure
    const unitOfMeasure = product.unitOfMeasure || 'kg';
    if (unitOfMeasure === 'ml' || unitOfMeasure === 'l') {
      // Liquid containers - typically cylindrical
      baseDimensions = { length: 25, width: 25, height: 15 };
    } else if (unitOfMeasure === 'pieces' || unitOfMeasure === 'cans') {
      // Individual items - compact packaging
      baseDimensions = { length: 30, width: 20, height: 12 };
    }
    
    // Scale dimensions based on quantity
    const scaleFactor = Math.cbrt(totalUnits / 10); // Cube root scaling
    
    return {
      length: Math.max(Math.round(baseDimensions.length * scaleFactor), 10),
      width: Math.max(Math.round(baseDimensions.width * scaleFactor), 10),
      height: Math.max(Math.round(baseDimensions.height * scaleFactor), 5)
    };
  }
  
  /**
   * Get service recommendations based on total weight
   */
  static getServiceRecommendations(totalWeight: number) {
    if (totalWeight <= 20) {
      return {
        recommended: 'Royal Mail',
        reason: 'Lightweight package - Royal Mail is cost-effective',
        alternatives: ['DPD Local', 'Evri Standard']
      };
    } else if (totalWeight <= 30) {
      return {
        recommended: 'DPD Local',
        reason: 'Medium weight - DPD offers reliable service',
        alternatives: ['Royal Mail 48', 'Evri Standard']
      };
    } else if (totalWeight <= 1000) {
      return {
        recommended: 'Pallet Service',
        reason: 'Heavy package - requires pallet delivery',
        alternatives: ['Multiple parcel shipment']
      };
    } else {
      return {
        recommended: 'Freight Service',
        reason: 'Very heavy - requires freight handling',
        alternatives: ['Contact for custom quote']
      };
    }
  }
}