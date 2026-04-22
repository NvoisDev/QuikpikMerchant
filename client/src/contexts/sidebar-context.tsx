import { createContext, useContext, useState, ReactNode } from "react";

interface SidebarContextValue {
  isDesktopCollapsed: boolean;
  toggleDesktopCollapsed: () => void;
  isMobileOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  mobileTopBarActions: ReactNode;
  setMobileTopBarActions: (actions: ReactNode) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isDesktopCollapsed: false,
  toggleDesktopCollapsed: () => {},
  isMobileOpen: false,
  openMobileSidebar: () => {},
  closeMobileSidebar: () => {},
  mobileTopBarActions: null,
  setMobileTopBarActions: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mobileTopBarActions, setMobileTopBarActions] = useState<ReactNode>(null);

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
      mobileTopBarActions,
      setMobileTopBarActions,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext() {
  return useContext(SidebarContext);
}
