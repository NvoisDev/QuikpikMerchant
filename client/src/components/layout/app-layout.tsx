import { useAuth } from "@/hooks/useAuth";
import Sidebar from "./sidebar";
import Footer from "@/components/ui/footer";
import { SidebarProvider, useSidebarContext } from "@/contexts/sidebar-context";

interface AppLayoutProps {
  children: React.ReactNode;
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const { user, isLoading } = useAuth();
  const { isDesktopCollapsed } = useSidebarContext();

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
      <div
        className={`flex-1 flex flex-col transition-[margin] duration-200 ${
          user ? (isDesktopCollapsed ? "lg:ml-14" : "lg:ml-64") : ""
        }`}
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
