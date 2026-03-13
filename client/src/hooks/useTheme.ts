import { useState } from "react";

type Theme = "light" | "dark" | "minimal";

export function useTheme() {
  const [currentTheme] = useState<Theme>("minimal");
  return { currentTheme };
}
