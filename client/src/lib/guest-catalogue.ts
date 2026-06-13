import { formatNumber } from "@/lib/currencies";

type GuestSellingFormat = "units" | "pallets" | "both" | null | undefined;

type GuestCatalogueProduct = {
  sellingFormat?: GuestSellingFormat;
  stock?: unknown;
  palletStock?: unknown;
};

export const getSellingFormatLabel = (sellingFormat?: GuestSellingFormat) => {
  if (sellingFormat === "pallets") return "Full Pallets";
  if (sellingFormat === "both") return "Units & Pallets";
  return "Individual Units";
};

const getGuestStockValue = (stock: unknown) => {
  const value = typeof stock === "number" ? stock : Number(stock);
  return Number.isFinite(value) ? value : 0;
};

export const getGuestStockRows = (product: GuestCatalogueProduct) => {
  const sellingFormat = product.sellingFormat || "units";
  const unitStock = getGuestStockValue(product.stock);
  const palletStock = getGuestStockValue(product.palletStock);
  const rows: Array<{ type: "units" | "pallets"; text: string; available: boolean }> = [];

  if (sellingFormat === "units" || sellingFormat === "both") {
    rows.push({
      type: "units",
      text: unitStock > 0 ? `${formatNumber(unitStock)} units available` : "Units unavailable or limited",
      available: unitStock > 0,
    });
  }

  if (sellingFormat === "pallets" || sellingFormat === "both") {
    rows.push({
      type: "pallets",
      text: palletStock > 0 ? `${formatNumber(palletStock)} pallets available` : "Pallets unavailable or limited",
      available: palletStock > 0,
    });
  }

  return rows;
};

export type GuestBackTarget =
  | { type: "seller-selection" }
  | { type: "store"; wholesalerId: string }
  | { type: "landing" };

export const getGuestBackTarget = (search: string): GuestBackTarget => {
  const guestFrom = new URLSearchParams(search).get("guestFrom");

  if (guestFrom?.startsWith("store:")) {
    const wholesalerId = guestFrom.slice("store:".length).trim();
    if (wholesalerId) {
      return { type: "store", wholesalerId };
    }
  }

  return guestFrom === "selection" ? { type: "seller-selection" } : { type: "landing" };
};