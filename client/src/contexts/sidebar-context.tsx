import { createContext, useContext, useState, useEffect } from "react";

interface SidebarContextValue {
  isDesktopCollapsed: boolean;
  toggleDesktopCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isDesktopCollapsed: false,
  toggleDesktopCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleDesktopCollapsed = () => {
    setIsDesktopCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  };

  return (
    <SidebarContext.Provider value={{ isDesktopCollapsed, toggleDesktopCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext() {
  return useContext(SidebarContext);
}
