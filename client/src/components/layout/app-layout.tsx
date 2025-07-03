import { useAuth } from "@/hooks/useAuth";
import Sidebar from "./sidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {user && <Sidebar />}
      <div className={user ? "lg:ml-64" : ""}>
        <main className="min-h-screen p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}