// Simulate what happens when you place different types of orders
// This demonstrates the Base Unit Inventory Logic

const currentInventory = {
  baseUnitStock: 15619,     // Current base units (source of truth)
  quantityInPack: 20,       // Base units per pack
  unitsPerPallet: 20        // Packs per pallet
};

console.log("=== CURRENT INVENTORY STATE ===");
console.log(`Base Units: ${currentInventory.baseUnitStock.toLocaleString()}`);
console.log(`Available Packs: ${Math.floor(currentInventory.baseUnitStock / currentInventory.quantityInPack)}`);
console.log(`Available Pallets: ${Math.floor(Math.floor(currentInventory.baseUnitStock / currentInventory.quantityInPack) / currentInventory.unitsPerPallet)}`);

console.log("\n=== SCENARIO 1: Order 50 Units ===");
const unitsOrder = 50;
const unitsDecrement = unitsOrder; // Direct base unit reduction
console.log(`Order: ${unitsOrder} units`);
console.log(`Base units to subtract: ${unitsDecrement}`);
console.log(`Remaining base units: ${currentInventory.baseUnitStock - unitsDecrement}`);

console.log("\n=== SCENARIO 2: Order 1 Pallet ===");
const palletOrder = 1;
const palletDecrement = palletOrder * currentInventory.unitsPerPallet * currentInventory.quantityInPack;
console.log(`Order: ${palletOrder} pallet`);
console.log(`Conversion: ${palletOrder} pallet × ${currentInventory.unitsPerPallet} packs/pallet × ${currentInventory.quantityInPack} units/pack = ${palletDecrement} base units`);
console.log(`Base units to subtract: ${palletDecrement}`);
console.log(`Remaining base units: ${currentInventory.baseUnitStock - palletDecrement}`);
console.log(`Remaining pallets: ${Math.floor((currentInventory.baseUnitStock - palletDecrement) / (currentInventory.quantityInPack * currentInventory.unitsPerPallet))}`);