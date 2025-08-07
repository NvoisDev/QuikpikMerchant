# Customer Portal Production Configuration

## Working API Endpoint

The customer portal uses this exact endpoint that's working in development:

```
GET /api/customer-products/{wholesalerId}
```

**Frontend Code (client/src/pages/customer-portal.tsx lines 1051-1081):**
```typescript
const { data: products = [], isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useQuery<Product[]>({
  queryKey: ['wholesaler-products', wholesalerId],
  queryFn: async () => {
    console.log(`🛒 Fetching products for wholesaler: ${wholesalerId}`);
    console.log(`🌐 Current domain: ${window.location.origin}`);
    const response = await fetch(`/api/customer-products/${wholesalerId}`);
    console.log(`📡 API Response status: ${response.status}`);
    console.log(`📡 API Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const responseText = await response.text();
      console.error(`❌ Products fetch failed: ${response.status} ${response.statusText}`);
      console.error(`❌ Response body:`, responseText.substring(0, 500));
      throw new Error(`Failed to fetch products: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ Products received: ${data.length} items`);
    console.log(`📦 Product sample:`, data.slice(0, 2).map(p => ({ id: p.id, name: p.name, status: p.status })));
    return data;
  },
  enabled: !!wholesalerId,
  refetchInterval: false,
  refetchIntervalInBackground: false,
  retry: 3,
  retryDelay: 1000,
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
});
```

**Backend Code (server/routes.ts lines 4273-4364):**
```typescript
// Customer-specific products endpoint for easy access - PRODUCTION SAFE VERSION
app.get('/api/customer-products/:wholesalerId', async (req, res) => {
  let wholesalerId = '';
  try {
    wholesalerId = req.params.wholesalerId;
    console.log(`🛍️ Customer requesting products for wholesaler: ${wholesalerId}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
    
    if (!wholesalerId) {
      return res.status(400).json({ error: 'Wholesaler ID is required' });
    }
    
    // Direct SQL query approach - production safe
    console.log('🔍 Executing direct SQL query...');
    const result = await db.execute(sql`
      SELECT p.*, u.business_name, u.first_name, u.last_name, u.profile_image_url, u.logo_type, u.logo_url
      FROM products p
      LEFT JOIN users u ON p.wholesaler_id = u.id
      WHERE p.wholesaler_id = ${wholesalerId} AND p.status = 'active'
      ORDER BY p.created_at DESC
    `);
    const rows = result.rows as any[];
    console.log(`📊 Raw query returned ${rows.length} rows`);
    
    // Transform results to expected format
    const products = rows.map(row => ({
      id: row.id,
      wholesalerId: row.wholesaler_id,
      name: row.name,
      description: row.description,
      price: row.price,
      currency: row.currency || 'GBP',
      moq: row.moq,
      stock: row.stock,
      imageUrl: row.images?.[0] || row.image_url,
      images: row.images || [],
      category: row.category,
      status: row.status,
      priceVisible: row.price_visible,
      negotiationEnabled: row.negotiation_enabled,
      minimumBidPrice: row.minimum_bid_price,
      packQuantity: row.pack_quantity,
      unitOfMeasure: row.unit_of_measure,
      unitSize: row.unit_size,
      sellingFormat: row.selling_format || 'units',
      unitsPerPallet: row.units_per_pallet,
      palletPrice: row.pallet_price,
      palletMoq: row.pallet_moq,
      palletStock: row.pallet_stock,
      unitWeight: row.unit_weight,
      palletWeight: row.pallet_weight,
      promoPrice: row.promo_price,
      promoActive: row.promo_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      wholesaler: {
        id: row.wholesaler_id,
        businessName: row.business_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Business',
        profileImageUrl: row.profile_image_url,
        logoType: row.logo_type || 'initials',
        logoUrl: row.logo_url,
        rating: 4.5
      }
    }));
    
    console.log(`✅ Successfully formatted ${products.length} products for response`);
    res.json(products);
    
  } catch (error: unknown) {
    const err = error as Error;
    console.error("❌ CRITICAL ERROR in customer products endpoint:", {
      message: err?.message || 'Unknown error',
      stack: err?.stack,
      name: err?.name,
      wholesalerId: wholesalerId,
      query: req.query,
      environment: process.env.NODE_ENV
    });
    
    res.status(500).json({ 
      message: "Failed to fetch customer products", 
      error: process.env.NODE_ENV === 'development' ? (err?.message || 'Unknown error') : 'Internal server error'
    });
  }
});
```

## Required Imports (already present in routes.ts)

```typescript
import { db } from "./db";
import { sql } from "drizzle-orm";
```

## Production Checklist

1. ✅ **Database Connection**: Ensure `DATABASE_URL` environment variable is set
2. ✅ **Direct SQL Query**: Uses production-safe database queries
3. ✅ **Error Handling**: Comprehensive error logging and handling
4. ✅ **Data Transformation**: Proper mapping of database rows to expected format
5. ✅ **Environment Detection**: Handles both development and production environments
6. ✅ **Status Filtering**: Only returns active products (`p.status = 'active'`)
7. ✅ **Caching**: Frontend implements proper caching with React Query

## Test with Wholesaler ID

For testing, use the working wholesaler ID: `104871691614680693123`

**URL Pattern**: `https://your-domain.com/store/104871691614680693123`

## Development Logs (Confirmed Working)

```
🛍️ Customer requesting products for wholesaler: 104871691614680693123
🔧 Environment: development
🔍 Executing direct SQL query...
📊 Raw query returned 11 rows
✅ Successfully formatted 11 products for response
GET /api/customer-products/104871691614680693123 200 in 2126ms
```

The API is returning 11 products successfully in development. For production deployment, ensure the same database connection and environment variables are properly configured.