import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, Store, Package, MapPin, Phone, Mail, 
  Star, Users, ArrowRight, Building2, Globe
} from 'lucide-react';

interface Wholesaler {
  id: string;
  businessName: string;
  storeTagline?: string;
  email?: string;
  phone?: string;
  address?: string;
  businessType?: string;
  isActive?: boolean;
  productCount?: number;
  rating?: number;
  verified?: boolean;
}

export default function StoreSelection() {
  const [, setLocation] = useLocation();
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  // Load wholesalers
  useEffect(() => {
    const loadWholesalers = async () => {
      try {
        console.log('Loading wholesaler stores...');
        
        const response = await fetch('/api/wholesalers', {
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load stores: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Loaded ${data.length} wholesaler stores`);
        
        // Filter active wholesalers only
        const activeWholesalers = data.filter((w: Wholesaler) => w.isActive !== false);
        setWholesalers(activeWholesalers);
      } catch (err) {
        console.error('Error loading wholesalers:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stores');
      } finally {
        setLoading(false);
      }
    };

    loadWholesalers();
  }, []);

  // Filter wholesalers based on search
  const filteredWholesalers = wholesalers.filter(wholesaler =>
    !searchTerm || 
    wholesaler.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wholesaler.storeTagline?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wholesaler.businessType?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStoreSelect = (wholesalerId: string) => {
    setLocation(`/store/${wholesalerId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-600">Loading stores...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <Store className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900">Unable to Load Stores</h2>
            <p className="text-gray-600">There was an issue loading the wholesaler stores.</p>
            <p className="text-sm text-red-600">{error}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-3">
              <Building2 className="w-10 h-10 text-green-600" />
              <h1 className="text-3xl font-bold text-gray-900">Quikpik Marketplace</h1>
            </div>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Discover wholesale suppliers and browse their product catalogs. 
              Choose from verified wholesalers to find the best deals for your business.
            </p>
            
            {/* Search Bar */}
            <div className="max-w-md mx-auto relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search stores..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-12 text-lg"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Results Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {filteredWholesalers.length === 1 ? '1 Store' : `${filteredWholesalers.length} Stores`} Available
          </h2>
          <Badge variant="outline" className="text-green-600 border-green-200">
            {wholesalers.length} Total Suppliers
          </Badge>
        </div>

        {/* Stores Grid */}
        {filteredWholesalers.length === 0 ? (
          <div className="text-center py-12">
            <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No stores found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search criteria.' : 'No wholesaler stores are currently available.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWholesalers.map(wholesaler => (
              <WholesalerCard 
                key={wholesaler.id} 
                wholesaler={wholesaler} 
                onSelect={handleStoreSelect}
              />
            ))}
          </div>
        )}

        {/* Call to Action */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mt-12 text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Looking to become a wholesaler?
          </h3>
          <p className="text-gray-600 mb-4">
            Join our platform and start selling to businesses worldwide.
          </p>
          <Button variant="outline" className="border-green-600 text-green-600 hover:bg-green-50">
            Learn More
          </Button>
        </div>
      </main>
    </div>
  );
}

function WholesalerCard({ 
  wholesaler, 
  onSelect 
}: { 
  wholesaler: Wholesaler; 
  onSelect: (id: string) => void; 
}) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-0 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Store className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-semibold text-gray-900 group-hover:text-green-700 transition-colors line-clamp-1">
                {wholesaler.businessName}
              </CardTitle>
              {wholesaler.storeTagline && (
                <p className="text-sm text-gray-600 line-clamp-1 mt-1">
                  {wholesaler.storeTagline}
                </p>
              )}
            </div>
          </div>
          
          {wholesaler.verified && (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              ✓ Verified
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        {/* Business Info */}
        <div className="space-y-2">
          {wholesaler.businessType && (
            <div className="flex items-center text-sm text-gray-600">
              <Building2 className="w-4 h-4 mr-2" />
              {wholesaler.businessType}
            </div>
          )}
          
          {wholesaler.address && (
            <div className="flex items-center text-sm text-gray-600">
              <MapPin className="w-4 h-4 mr-2" />
              <span className="line-clamp-1">{wholesaler.address}</span>
            </div>
          )}
          
          {wholesaler.productCount !== undefined && (
            <div className="flex items-center text-sm text-gray-600">
              <Package className="w-4 h-4 mr-2" />
              {wholesaler.productCount} products available
            </div>
          )}
        </div>

        {/* Rating */}
        {wholesaler.rating && (
          <div className="flex items-center space-x-1">
            <Star className="w-4 h-4 text-yellow-400 fill-current" />
            <span className="text-sm font-medium text-gray-900">
              {wholesaler.rating.toFixed(1)}
            </span>
            <span className="text-sm text-gray-500">(Rating)</span>
          </div>
        )}

        {/* Contact Info */}
        <div className="space-y-1">
          {wholesaler.email && (
            <div className="flex items-center text-xs text-gray-500">
              <Mail className="w-3 h-3 mr-2" />
              <span className="line-clamp-1">{wholesaler.email}</span>
            </div>
          )}
          
          {wholesaler.phone && (
            <div className="flex items-center text-xs text-gray-500">
              <Phone className="w-3 h-3 mr-2" />
              {wholesaler.phone}
            </div>
          )}
        </div>

        {/* Action Button */}
        <Button 
          onClick={() => onSelect(wholesaler.id)}
          className="w-full bg-green-600 hover:bg-green-700 text-white group-hover:bg-green-700 transition-colors"
        >
          <span>Browse Store</span>
          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </CardContent>
    </Card>
  );
}