import { createContext, useContext, useState } from "react";

interface SidebarContextValue {
  isDesktopCollapsed: boolean;
  toggleDesktopCollapsed: () => void;
  isMobileOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isDesktopCollapsed: false,
  toggleDesktopCollapsed: () => {},
  isMobileOpen: false,
  openMobileSidebar: () => {},
  closeMobileSidebar: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);

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
    <SidebarContext.Provider value={{
      isDesktopCollapsed,
      toggleDesktopCollapsed,
      isMobileOpen,
      openMobileSidebar: () => setIsMobileOpen(true),
      closeMobileSidebar: () => setIsMobileOpen(false),
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext() {
  return useContext(SidebarContext);
}
