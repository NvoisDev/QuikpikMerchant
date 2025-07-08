import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/theme-toggle";
import Sidebar from "./sidebar";
import Footer from "@/components/ui/footer";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {user && <Sidebar />}
      <div className={`flex-1 flex flex-col ${user ? "lg:ml-64" : ""}`}>
        {/* Top Header with Theme Toggle */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-8 py-3">
          <div className="flex justify-end">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}