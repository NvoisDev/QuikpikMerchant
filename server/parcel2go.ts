import axios from 'axios';

// Parcel2Go API Configuration
const PARCEL2GO_BASE_URL = 'https://api.parcel2go.com';
const PARCEL2GO_SANDBOX_URL = 'https://api-sandbox.parcel2go.com';
const PARCEL2GO_AUTH_PATH = '/auth/connect/token';

export interface Parcel2GoCredentials {
  clientId: string;
  clientSecret: string;
  environment?: 'live' | 'sandbox';
}

export interface ParcelDimensions {
  weight: number; // in kg
  length: number; // in cm
  width: number;  // in cm
  height: number; // in cm
  value: number;  // declared value in pounds
  contentCategory?: string; // 'food', 'pharmaceuticals', 'electronics', 'textiles', 'general'
  temperatureRequirement?: string; // 'frozen', 'chilled', 'ambient'
  specialHandling?: {
    fragile?: boolean;
    hazardous?: boolean;
    perishable?: boolean;
  };
  contentDescription?: string; // Description of contents for customs/handling
}

export interface Address {
  contactName: string;
  organisation?: string;
  email?: string;
  phone?: string;
  property: string;
  street: string;
  locality?: string;
  town: string;
  county?: string;
  postcode: string;
  countryIsoCode: string; // 3-letter ISO code (e.g., "GBR")
  specialInstructions?: string;
}

export interface QuoteRequest {
  collectionAddress: Address;
  deliveryAddress: Address;
  parcels: ParcelDimensions[];
  collectionDate?: string; // ISO date string
  serviceFilters?: {
    temperatureControlled?: boolean; // Filter for temperature-controlled services
    nextDay?: boolean; // Filter for next-day delivery
    tracked?: boolean; // Filter for tracked services
    insured?: boolean; // Filter for insured services
  };
}

export interface DeliveryQuote {
  serviceId: string;
  serviceName: string;
  carrierName: string;
  price: number;
  priceExVat: number;
  vat: number;
  transitTime: string;
  collectionType: string; // 'DropOff' | 'Collection'
  deliveryType: string;   // 'Delivery' | 'DropOff'
  trackingAvailable: boolean;
  insuranceIncluded: boolean;
  description: string;
  temperatureControlled?: boolean; // Whether service supports temperature control
  specialHandlingSupported?: string[]; // Array of supported special handling types
  maxWeight?: number; // Maximum weight limit for this service in kg
  restrictions?: string[]; // Any restrictions or requirements
}

export interface DropShop {
  id: string;
  name: string;
  address: string;
  postcode: string;
  town: string;
  distance: number; // in miles
  openingTimes: string;
  phone?: string;
  latitude: number;
  longitude: number;
}

export interface OrderItem {
  Id: string;
  CollectionDate: string; // ISO date string
  Service: string; // Service ID from quotes
  Upsells?: Array<{Type: string}>; // Optional extras like SMS, Insurance
  Parcels: Array<{
    Id?: string;
    Height: number;
    Length: number;
    Width: number;
    Weight: number;
    EstimatedValue: number;
    DeliveryAddress: Address;
    ContentsSummary: string;
  }>;
  CollectionAddress: Address;
}

export interface OrderRequest {
  Items: OrderItem[];
  CustomerDetails: {
    Email: string;
    Forename: string;
    Surname: string;
  };
}

export interface OrderResponse {
  OrderId: string;
  Links: {
    PayWithPrePay?: string;
    payment?: string;
    help?: string;
  };
  TotalPrice: number;
  TotalVat: number;
  TotalPriceExVat: number;
  Hash: string;
  OrderlineIdMap: Array<{
    Hash: string;
    OrderLineId: string;
    ItemId: string;
  }>;
  TotalDiscount: number;
}

class Parcel2GoService {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private credentials: Parcel2GoCredentials | null = null;

  constructor(credentials?: Parcel2GoCredentials) {
    this.credentials = credentials || null;
  }

  setCredentials(credentials: Parcel2GoCredentials) {
    this.credentials = credentials;
    // Clear existing token when credentials change
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  private getBaseUrl(): string {
    return this.credentials?.environment === 'live' ? PARCEL2GO_BASE_URL : PARCEL2GO_SANDBOX_URL;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Parcel2Go credentials not configured');
    }

    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Try multiple API endpoints in order of preference
    const urls = [
      this.getBaseUrl(),
      PARCEL2GO_BASE_URL, // Always try live API
      'https://api.parcel2go.com', // Alternative live endpoint
      'https://sandbox.parcel2go.com' // Alternative sandbox endpoint
    ].filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates

    for (const baseUrl of urls) {
      try {
        const authUrl = `${baseUrl}${PARCEL2GO_AUTH_PATH}`;
        console.log(`🔐 Attempting Parcel2Go authentication with: ${authUrl}`);
        
        const response = await axios.post(authUrl, 
          new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'public-api payment my-profile',
            client_id: this.credentials.clientId,
            client_secret: this.credentials.clientSecret
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': '*/*'
            },
            timeout: 10000 // 10 second timeout
          }
        );

        this.accessToken = response.data.access_token;
        // Set expiry to 90% of the actual expiry time for safety
        const expiresIn = response.data.expires_in * 0.9;
        this.tokenExpiry = new Date(Date.now() + (expiresIn * 1000));
        
        console.log(`✅ Successfully authenticated with Parcel2Go using: ${baseUrl}`);
        return this.accessToken;
      } catch (error: any) {
        console.error(`❌ Failed to authenticate with ${baseUrl}:`, error.response?.data || error.message);
        if (baseUrl === urls[urls.length - 1]) {
          // This was the last attempt
          throw new Error('Failed to authenticate with Parcel2Go API - all endpoints tried');
        }
        // Continue to next URL
        continue;
      }
    }
    
    throw new Error('Failed to authenticate with Parcel2Go API');
  }

  private async makeRequest(endpoint: string, data?: any, method: 'GET' | 'POST' = 'GET') {
    const token = await this.getAccessToken();
    const url = `${this.getBaseUrl()}/api${endpoint}`;

    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error(`Parcel2Go API error (${endpoint}):`, error.response?.data || error.message);
      throw new Error(`Parcel2Go API request failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getQuotes(request: QuoteRequest): Promise<DeliveryQuote[]> {
    const requestData = {
      CollectionAddress: {
        Country: request.collectionAddress.countryIsoCode
      },
      DeliveryAddress: {
        Country: request.deliveryAddress.countryIsoCode,
        ...(request.deliveryAddress.postcode && { Postcode: request.deliveryAddress.postcode })
      },
      Parcels: request.parcels.map(parcel => ({
        Value: parcel.value,
        Weight: parcel.weight,
        Length: parcel.length,
        Width: parcel.width,
        Height: parcel.height,
        ...(parcel.contentDescription && { ContentsDescription: parcel.contentDescription }),
        ...(parcel.contentCategory && { ContentCategory: parcel.contentCategory })
      })),
      ...(request.collectionDate && { CollectionDate: request.collectionDate }),
      // Add service filters for special requirements
      ...(request.serviceFilters && { ServiceFilters: request.serviceFilters })
    };

    const response = await this.makeRequest('/quotes', requestData, 'POST');

    let services = response.Services?.map((service: any) => ({
      serviceId: service.Id,
      serviceName: service.Name,
      carrierName: service.Courier || service.Name,
      price: service.Price,
      priceExVat: service.PriceExVat,
      vat: service.Vat,
      transitTime: service.TransitTime || 'Not specified',
      collectionType: service.CollectionType || 'Collection',
      deliveryType: service.DeliveryType || 'Delivery',
      trackingAvailable: service.TrackingAvailable || false,
      insuranceIncluded: service.InsuranceIncluded || false,
      description: service.Description || service.Name,
      temperatureControlled: this.isTemperatureControlledService(service.Name, service.Description),
      specialHandlingSupported: this.getSpecialHandlingSupport(service.Name, service.Description),
      maxWeight: service.MaxWeight || 30, // Default 30kg if not specified
      restrictions: this.getServiceRestrictions(service.Name, service.Description)
    })) || [];

    // Filter services based on parcel requirements
    services = this.filterServicesForRequirements(services, request.parcels);

    return services;
  }

  // Helper method to determine if a service supports temperature control
  private isTemperatureControlledService(serviceName: string, description: string): boolean {
    const tempControlIndicators = [
      'refrigerated', 'chilled', 'frozen', 'temperature controlled', 
      'cold chain', 'ambient', 'fresh', 'perishable'
    ];
    const text = `${serviceName} ${description}`.toLowerCase();
    return tempControlIndicators.some(indicator => text.includes(indicator));
  }

  // Helper method to determine special handling support
  private getSpecialHandlingSupport(serviceName: string, description: string): string[] {
    const supported = [];
    const text = `${serviceName} ${description}`.toLowerCase();
    
    if (text.includes('fragile') || text.includes('delicate')) supported.push('fragile');
    if (text.includes('hazardous') || text.includes('dangerous')) supported.push('hazardous');
    if (text.includes('perishable') || text.includes('fresh')) supported.push('perishable');
    if (text.includes('signature') || text.includes('secure')) supported.push('signature');
    
    return supported;
  }

  // Helper method to get service restrictions
  private getServiceRestrictions(serviceName: string, description: string): string[] {
    const restrictions = [];
    const text = `${serviceName} ${description}`.toLowerCase();
    
    if (text.includes('mainland uk only')) restrictions.push('UK mainland only');
    if (text.includes('no weekend delivery')) restrictions.push('No weekend delivery');
    if (text.includes('business addresses only')) restrictions.push('Business addresses only');
    
    return restrictions;
  }

  // Helper method to filter services based on parcel requirements
  private filterServicesForRequirements(services: DeliveryQuote[], parcels: ParcelDimensions[]): DeliveryQuote[] {
    return services.filter(service => {
      // Check if service meets temperature requirements
      const hasTemperatureRequirements = parcels.some(p => 
        p.temperatureRequirement && p.temperatureRequirement !== 'ambient'
      );
      
      if (hasTemperatureRequirements && !service.temperatureControlled) {
        return false; // Service doesn't support temperature control
      }

      // Check weight limits
      const maxParcelWeight = Math.max(...parcels.map(p => p.weight));
      if (service.maxWeight && maxParcelWeight > service.maxWeight) {
        return false; // Parcel exceeds weight limit
      }

      // Check special handling requirements
      const specialHandlingNeeded = parcels.some(p => 
        p.specialHandling && (p.specialHandling.fragile || p.specialHandling.hazardous || p.specialHandling.perishable)
      );
      
      if (specialHandlingNeeded && service.specialHandlingSupported?.length === 0) {
        return false; // Service doesn't support required special handling
      }

      return true;
    });
  }

  async getDropShops(postcode: string, countryCode: string = 'GBR'): Promise<DropShop[]> {
    try {
      const response = await this.makeRequest(`/dropshops?postcode=${encodeURIComponent(postcode)}&country=${countryCode}`);
      
      return response.DropShops?.map((shop: any) => ({
        id: shop.Id,
        name: shop.Name,
        address: shop.Address,
        postcode: shop.Postcode,
        town: shop.Town,
        distance: shop.Distance,
        openingTimes: shop.OpeningTimes || 'Contact shop for hours',
        phone: shop.Phone,
        latitude: shop.Latitude,
        longitude: shop.Longitude
      })) || [];
    } catch (error) {
      console.error('Failed to get drop shops:', error);
      return [];
    }
  }

  async getCountries(): Promise<{code: string, name: string}[]> {
    try {
      const response = await this.makeRequest('/countries');
      
      return response.Countries?.map((country: any) => ({
        code: country.IsoCode,
        name: country.Name
      })) || [];
    } catch (error) {
      console.error('Failed to get countries:', error);
      return [];
    }
  }

  async getServices(): Promise<{id: string, name: string, description: string}[]> {
    try {
      const response = await this.makeRequest('/services');
      
      return response.Services?.map((service: any) => ({
        id: service.Id,
        name: service.Name,
        description: service.Description || service.Name
      })) || [];
    } catch (error) {
      console.error('Failed to get services:', error);
      return [];
    }
  }

  async createOrder(orderRequest: OrderRequest): Promise<OrderResponse> {
    try {
      const response = await this.makeRequest('/orders', orderRequest, 'POST');
      return response;
    } catch (error: any) {
      console.error('Failed to create order:', error);
      throw new Error(`Failed to create order: ${error.response?.data?.message || error.message}`);
    }
  }

  async verifyOrder(orderRequest: OrderRequest): Promise<any> {
    try {
      const response = await this.makeRequest('/orders/verify', orderRequest, 'POST');
      return response;
    } catch (error: any) {
      console.error('Failed to verify order:', error);
      throw new Error(`Failed to verify order: ${error.response?.data?.message || error.message}`);
    }
  }

  async payWithPrePay(orderId: string, hash: string): Promise<any> {
    try {
      const response = await this.makeRequest(`/orders/${orderId}/paywithprepay?hash=${hash}`, {}, 'POST');
      return response;
    } catch (error: any) {
      console.error('Failed to pay with prepay:', error);
      throw new Error(`Failed to pay with prepay: ${error.response?.data?.message || error.message}`);
    }
  }

  async getOrderDetails(orderId: string, hash: string): Promise<any> {
    try {
      const response = await this.makeRequest(`/orders/${orderId}?hash=${hash}`);
      return response;
    } catch (error: any) {
      console.error('Failed to get order details:', error);
      throw new Error(`Failed to get order details: ${error.response?.data?.message || error.message}`);
    }
  }

  async getLabels(orderId: string, hash: string, format: 'pdf' | 'png' = 'pdf'): Promise<any> {
    try {
      const response = await this.makeRequest(`/orders/${orderId}/labels?hash=${hash}&format=${format}`);
      return response;
    } catch (error: any) {
      console.error('Failed to get labels:', error);
      throw new Error(`Failed to get labels: ${error.response?.data?.message || error.message}`);
    }
  }

  async trackOrder(orderLineId: string): Promise<any> {
    try {
      const response = await this.makeRequest(`/tracking/${orderLineId}`);
      return response;
    } catch (error: any) {
      console.error('Failed to track order:', error);
      throw new Error(`Failed to track order: ${error.response?.data?.message || error.message}`);
    }
  }

  // Helper method to validate addresses
  validateAddress(address: Address): string[] {
    const errors: string[] = [];
    
    if (!address.contactName?.trim()) errors.push('Contact name is required');
    if (!address.property?.trim()) errors.push('Property number/name is required');
    if (!address.street?.trim()) errors.push('Street address is required');
    if (!address.town?.trim()) errors.push('Town/city is required');
    if (!address.postcode?.trim()) errors.push('Postcode is required');
    if (!address.countryIsoCode?.trim()) errors.push('Country code is required');
    
    return errors;
  }

  // Helper method to convert UK postcode to correct format
  formatUKPostcode(postcode: string): string {
    if (!postcode) return postcode;
    
    // Remove spaces and convert to uppercase
    const cleaned = postcode.replace(/\s/g, '').toUpperCase();
    
    // Add space before last 3 characters for UK postcodes
    if (cleaned.length >= 5 && cleaned.length <= 7) {
      return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
    }
    
    return postcode;
  }
}

// Create default instance that can be configured later
export const parcel2goService = new Parcel2GoService();

// Export test credentials for development/testing
export const createTestCredentials = (): Parcel2GoCredentials => ({
  clientId: process.env.PARCEL2GO_CLIENT_ID || '',
  clientSecret: process.env.PARCEL2GO_CLIENT_SECRET || '',
  environment: (process.env.PARCEL2GO_ENVIRONMENT as 'live' | 'sandbox') || 'sandbox'
});