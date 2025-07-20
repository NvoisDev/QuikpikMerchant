import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

// Simple authentication hook
function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/user')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data);
        setIsLoading(false);
      })
      .catch(() => {
        setUser(null);
        setIsLoading(false);
      });
  }, []);

  return { user, isLoading, isAuthenticated: !!user };
}

// Simple Dashboard Component
function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">Quikpik Merchant</h1>
            <button 
              onClick={() => window.location.href = '/api/auth/logout'}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Quick Stats */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Products</h3>
            <p className="text-3xl font-bold text-blue-600">12</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Orders</h3>
            <p className="text-3xl font-bold text-green-600">8</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Customers</h3>
            <p className="text-3xl font-bold text-purple-600">45</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">Revenue</h3>
            <p className="text-3xl font-bold text-orange-600">£2,450</p>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <NavCard 
            title="Products" 
            description="Manage your product inventory"
            onClick={() => alert('Products section - Coming soon')}
          />
          <NavCard 
            title="Orders" 
            description="View and manage customer orders"
            onClick={() => alert('Orders section - Coming soon')}
          />
          <NavCard 
            title="Customers" 
            description="Manage customer groups and contacts"
            onClick={() => alert('Customers section - Coming soon')}
          />
          <NavCard 
            title="Campaigns" 
            description="Send WhatsApp broadcasts to customers"
            onClick={() => alert('Campaigns section - Coming soon')}
          />
          <NavCard 
            title="Analytics" 
            description="View business performance metrics"
            onClick={() => alert('Analytics section - Coming soon')}
          />
          <NavCard 
            title="Settings" 
            description="Configure your business settings"
            onClick={() => alert('Settings section - Coming soon')}
          />
        </div>
      </main>
    </div>
  );
}

// Navigation Card Component
function NavCard({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="bg-white p-6 rounded-lg shadow hover:shadow-md cursor-pointer transition-shadow"
    >
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

// Landing Page Component
function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">
            Quikpik Merchant Platform
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Manage your wholesale business with ease
          </p>
          <div className="space-x-4">
            <button 
              onClick={() => window.location.href = '/api/auth/google'}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg hover:bg-blue-700"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading Component
function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
    </div>
  );
}

// Main App Component
function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="App">
        {user ? <Dashboard /> : <LandingPage />}
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;