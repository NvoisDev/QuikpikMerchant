import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';

interface Product {
  id: number;
  name: string;
  price: string;
  stock: number;
  moq: number;
  imageUrl?: string;
  category?: string;
  wholesaler: {
    businessName: string;
    email?: string;
  };
}

export default function SimpleStore() {
  const [, params] = useRoute('/simple-store/:wholesalerId');
  const wholesalerId = params?.wholesalerId;
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!wholesalerId) return;
    
    const loadData = async () => {
      try {
        console.log('Loading products for:', wholesalerId);
        
        const response = await fetch(`/api/customer-products/${wholesalerId}`);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Products loaded:', data.length);
        
        setProducts(data);
        setError('');
      } catch (err) {
        console.error('Load error:', err);
        setError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [wholesalerId]);

  if (loading) {
    return (
      <div style={{ padding: '50px', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '50px', textAlign: 'center' }}>
        <h2>Store Loading Error</h2>
        <p>Error: {error}</p>
        <button 
          onClick={() => window.location.reload()}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#22c55e', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  const wholesaler = products[0]?.wholesaler;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <header style={{ 
        backgroundColor: 'white', 
        borderBottom: '1px solid #e5e7eb',
        padding: '20px'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0' }}>
            {wholesaler?.businessName || 'Wholesale Store'}
          </h1>
          <p style={{ color: '#6b7280', margin: '5px 0 0' }}>
            {products.length} products available
          </p>
        </div>
      </header>

      {/* Products */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <h3>No products found</h3>
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '20px' 
          }}>
            {products.map(product => (
              <div key={product.id} style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb'
              }}>
                {/* Product Image */}
                <div style={{ marginBottom: '15px' }}>
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name}
                      style={{ 
                        width: '100%', 
                        height: '200px', 
                        objectFit: 'contain',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px'
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '200px', 
                      backgroundColor: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      color: '#9ca3af'
                    }}>
                      📦 No Image
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <h3 style={{ 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  margin: '0 0 10px',
                  color: '#111827'
                }}>
                  {product.name}
                </h3>

                {product.category && (
                  <span style={{
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    display: 'inline-block',
                    marginBottom: '10px'
                  }}>
                    {product.category}
                  </span>
                )}

                <div style={{ marginBottom: '15px' }}>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: 'bold', 
                    color: '#059669',
                    marginBottom: '5px'
                  }}>
                    £{parseFloat(product.price).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    MOQ: {product.moq} units • Stock: {product.stock}
                  </div>
                </div>

                {/* Contact Button */}
                <button 
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const email = wholesaler?.email;
                    const subject = `Inquiry about ${product.name}`;
                    const body = `Hello,\n\nI'm interested in ${product.name}.\n\nPlease provide pricing and availability.\n\nThank you!`;
                    
                    if (email) {
                      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    } else {
                      alert('Contact wholesaler directly for pricing');
                    }
                  }}
                >
                  ✉️ Contact for Pricing
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      {wholesaler && (
        <footer style={{ 
          backgroundColor: 'white', 
          borderTop: '1px solid #e5e7eb',
          padding: '30px 20px',
          marginTop: '40px'
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '18px' }}>Contact Wholesaler</h3>
            {wholesaler.email && (
              <div style={{ color: '#6b7280' }}>
                📧 <a 
                  href={`mailto:${wholesaler.email}`}
                  style={{ color: '#059669', textDecoration: 'none' }}
                >
                  {wholesaler.email}
                </a>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}