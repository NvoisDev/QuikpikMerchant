import { useAuth } from "@/hooks/useAuth";
import Sidebar from "./sidebar";
import Footer from "@/components/ui/footer";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {user && <Sidebar />}
      <div className={`flex-1 flex flex-col ${user ? "lg:ml-64" : ""}`}>
        <main className="flex-1 p-2 sm:p-4 lg:p-6 xl:p-8">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}