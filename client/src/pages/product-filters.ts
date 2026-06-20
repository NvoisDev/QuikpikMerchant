import type { Product } from "@shared/schema";

export type ProductFilterInput = Pick<
  Product,
  "name" | "description" | "category" | "status" | "stock" | "expiryDate"
> & {
  nearestExpiry?: string | null;
};

export interface ProductFilterState {
  searchQuery: string;
  statusFilter: string;
  categoryFilter: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function productMatchesFilters(
  product: ProductFilterInput,
  { searchQuery, statusFilter, categoryFilter }: ProductFilterState,
): boolean {
  const query = searchQuery.toLowerCase();
  const matchesSearch =
    product.name.toLowerCase().includes(query) ||
    !!product.description?.toLowerCase().includes(query);
  const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;

  if (statusFilter === "expiring") {
    const now = Date.now();
    const thirtyDaysFromNow = now + THIRTY_DAYS_MS;
    const hasExpiryDate = !!product.expiryDate;
    const nearestExpiryTime = product.nearestExpiry ? new Date(product.nearestExpiry).getTime() : null;
    const hasNearestExpirySoon =
      nearestExpiryTime !== null && nearestExpiryTime >= now && nearestExpiryTime <= thirtyDaysFromNow;
    return matchesSearch && matchesCategory && (hasExpiryDate || hasNearestExpirySoon);
  }

  const matchesStatus =
    statusFilter === "all" ||
    product.status === statusFilter ||
    (statusFilter === "out_of_stock" && (product.stock === 0 || product.stock === null));
  return matchesSearch && matchesStatus && matchesCategory;
}
