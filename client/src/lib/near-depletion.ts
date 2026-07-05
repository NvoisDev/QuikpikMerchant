import { useState, useCallback } from "react";

const STORAGE_KEY = "quikpik_near_depletion_threshold";
const DEFAULT_THRESHOLD = 90;

export function getNearDepletionThreshold(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= 1 && val <= 100) return val;
    }
  } catch {}
  return DEFAULT_THRESHOLD;
}

export function useNearDepletionThreshold() {
  const [threshold, setThresholdState] = useState<number>(() => getNearDepletionThreshold());

  const setThreshold = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(value)));
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {}
    setThresholdState(clamped);
  }, []);

  return { threshold, setThreshold, defaultThreshold: DEFAULT_THRESHOLD };
}
