import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "quikpik_saved_products";

export interface SavedProduct {
  id: string;
  slug: string;
  name: string;
  price: string | null;
  priceVisible: boolean;
  category: string;
  image: string | null;
  wholesalerName: string;
  wholesalerSlug: string;
  savedAt: number;
}

function readStorage(): SavedProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedProduct[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: SavedProduct[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export function useSavedProducts() {
  const [saved, setSaved] = useState<SavedProduct[]>(readStorage);

  useEffect(() => {
    writeStorage(saved);
  }, [saved]);

  const isSaved = useCallback(
    (id: string) => saved.some((p) => p.id === id),
    [saved]
  );

  const toggleSave = useCallback((product: SavedProduct) => {
    setSaved((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [{ ...product, savedAt: Date.now() }, ...prev];
    });
  }, []);

  const removeSaved = useCallback((id: string) => {
    setSaved((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setSaved([]);
  }, []);

  return { saved, isSaved, toggleSave, removeSaved, clearAll };
}
