import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Package, Calculator, Truck } from 'lucide-react';

interface ProductUnitConfigurationProps {
  packQuantity?: number;
  unitOfMeasure?: string;
  sizePerUnit?: number;
  onConfigurationChange: (config: {
    packQuantity: number;
    unitOfMeasure: string;
    sizePerUnit: number;
    calculatedWeight: number;
    displayFormat: string;
  }) => void;
}

const UNIT_OPTIONS = [
  { value: 'g', label: 'g (grams)', category: 'weight' },
  { value: 'kg', label: 'kg (kilograms)', category: 'weight' },
  { value: 'ml', label: 'ml (millilitres)', category: 'volume' },
  { value: 'l', label: 'l (litres)', category: 'volume' },
  { value: 'cl', label: 'cl (centilitres)', category: 'volume' },
  { value: 'pieces', label: 'pieces', category: 'count' },
  { value: 'units', label: 'units', category: 'count' },
  { value: 'cans', label: 'cans', category: 'count' },
  { value: 'bottles', label: 'bottles', category: 'count' },
];

export function ProductUnitConfiguration({ 
  packQuantity = 20, 
  unitOfMeasure = 'g', 
  sizePerUnit = 100.000,
  onConfigurationChange 
}: ProductUnitConfigurationProps) {
  const [config, setConfig] = useState({
    packQuantity,
    unitOfMeasure,
    sizePerUnit
  });

  // Calculate weight and display format based on configuration
  const calculateConfiguration = (packQty: number, unit: string, size: number) => {
    let calculatedWeight = 0;
    let displayFormat = '';

    // Calculate total package weight based on unit type
    if (unit === 'g') {
      calculatedWeight = (packQty * size) / 1000; // Convert grams to kg
      displayFormat = `${packQty} x ${size.toFixed(0)}g`;
    } else if (unit === 'kg') {
      calculatedWeight = packQty * size;
      displayFormat = `${packQty} x ${size.toFixed(3)}kg`;
    } else if (unit === 'ml') {
      // Assume density of 1g/ml for liquids (can be customized)
      calculatedWeight = (packQty * size) / 1000;
      displayFormat = `${packQty} x ${size.toFixed(0)}ml`;
    } else if (unit === 'l') {
      calculatedWeight = packQty * size; // Assume 1kg per litre
      displayFormat = `${packQty} x ${size.toFixed(3)}l`;
    } else if (unit === 'cl') {
      calculatedWeight = (packQty * size) / 100; // Convert cl to kg
      displayFormat = `${packQty} x ${size.toFixed(0)}cl`;
    } else {
      // For pieces, units, cans, bottles - estimate 100g per item
      calculatedWeight = (packQty * 0.1);
      displayFormat = `${packQty} ${unit}`;
    }

    return {
      packQuantity: packQty,
      unitOfMeasure: unit,
      sizePerUnit: size,
      calculatedWeight,
      displayFormat
    };
  };

  // Update configuration when values change
  useEffect(() => {
    const newConfig = calculateConfiguration(config.packQuantity, config.unitOfMeasure, config.sizePerUnit);
    onConfigurationChange(newConfig);
  }, [config.packQuantity, config.unitOfMeasure, config.sizePerUnit, onConfigurationChange]);

  const handlePackQuantityChange = (value: string) => {
    const quantity = parseInt(value) || 1;
    setConfig(prev => ({ ...prev, packQuantity: quantity }));
  };

  const handleUnitChange = (value: string) => {
    setConfig(prev => ({ ...prev, unitOfMeasure: value }));
  };

  const handleSizeChange = (value: string) => {
    const size = parseFloat(value) || 0;
    setConfig(prev => ({ ...prev, sizePerUnit: size }));
  };

  const currentConfig = calculateConfiguration(config.packQuantity, config.unitOfMeasure, config.sizePerUnit);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-600" />
          <div>
            <CardTitle className="text-lg">Product Unit Configuration</CardTitle>
            <CardDescription>
              Configure how your product is packaged and measured for accurate shipping calculations
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Flexible Unit Configuration Section */}
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-4 w-4 text-blue-600" />
            <h3 className="font-medium text-blue-900 dark:text-blue-100">Flexible Unit Configuration</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Quantity in Pack */}
            <div className="space-y-2">
              <Label htmlFor="packQuantity" className="text-sm font-medium">
                Quantity in Pack
              </Label>
              <Input
                id="packQuantity"
                type="number"
                min="1"
                value={config.packQuantity}
                onChange={(e) => handlePackQuantityChange(e.target.value)}
                placeholder="20"
                className="text-center"
              />
              <p className="text-xs text-muted-foreground">Number per pack (optional)</p>
            </div>

            {/* Unit of Measure */}
            <div className="space-y-2">
              <Label htmlFor="unitOfMeasure" className="text-sm font-medium">
                Unit of Measure
              </Label>
              <Select value={config.unitOfMeasure} onValueChange={handleUnitChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Weight</p>
                    {UNIT_OPTIONS.filter(unit => unit.category === 'weight').map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                    <p className="text-xs font-medium text-muted-foreground mb-2 mt-3">Volume</p>
                    {UNIT_OPTIONS.filter(unit => unit.category === 'volume').map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                    <p className="text-xs font-medium text-muted-foreground mb-2 mt-3">Count</p>
                    {UNIT_OPTIONS.filter(unit => unit.category === 'count').map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Base unit (ml, g, pieces, etc.)</p>
            </div>

            {/* Size per Unit */}
            <div className="space-y-2">
              <Label htmlFor="sizePerUnit" className="text-sm font-medium">
                Size per Unit
              </Label>
              <Input
                id="sizePerUnit"
                type="number"
                step="0.001"
                min="0"
                value={config.sizePerUnit}
                onChange={(e) => handleSizeChange(e.target.value)}
                placeholder="100.000"
                className="text-center"
              />
              <p className="text-xs text-muted-foreground">Size/weight per unit</p>
            </div>
          </div>

          {/* Example Display */}
          <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Example:</span>
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              For "{currentConfig.displayFormat}", enter: Quantity = {config.packQuantity}, Unit = {config.unitOfMeasure}, Size = {config.sizePerUnit.toFixed(3)}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              This replaces the need for predefined formats and allows any combination
            </p>
          </div>
        </div>

        {/* Calculated Shipping Information */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-green-600" />
            <h3 className="font-medium text-green-900 dark:text-green-100">Calculated Shipping Information</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-800 dark:text-green-200">Package Weight</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {currentConfig.calculatedWeight.toFixed(3)} kg
                </Badge>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Used for accurate shipping quotes
              </p>
            </div>
            
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-800 dark:text-green-200">Display Format</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {currentConfig.displayFormat}
                </Badge>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                How customers see the product
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}