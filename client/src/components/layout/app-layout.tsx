import { useAuth } from "@/hooks/useAuth";
import Sidebar from "./sidebar";
import Footer from "@/components/ui/footer";
import { SidebarProvider, useSidebarContext } from "@/contexts/sidebar-context";
import Logo from "@/components/ui/logo";
import { Menu } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const { user, isLoading } = useAuth();
  const { isDesktopCollapsed, openMobileSidebar } = useSidebarContext();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-8 bg-gradient-to-t from-primary/60 to-primary rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.1}s`, animationDuration: "1.3s" }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500 text-center">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      {user && <Sidebar />}

      {/* Mobile-only top header bar — replaces the old floating hamburger */}
      {user && (
        <header className="lg:hidden fixed top-0 left-0 right-0 h-14 z-[45] bg-slate-900 border-b border-slate-700/60 flex items-center px-3 gap-3">
          <button
            onClick={openMobileSidebar}
            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 flex justify-center pr-9">
            <Logo size="sm" />
          </div>
        </header>
      )}

      <div
        className={`flex-1 flex flex-col transition-[margin] duration-200 ${
          user ? (isDesktopCollapsed ? "lg:ml-14" : "lg:ml-64") : ""
        } ${user ? "pt-14 lg:pt-0" : ""}`}
      >
        <main className="flex-1 p-2 sm:p-4 lg:p-6 xl:p-8">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarProvider>
  );
}
