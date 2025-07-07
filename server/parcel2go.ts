import axios from 'axios';

// Environment variables for Parcel2Go API
const PARCEL2GO_BASE_URL = process.env.PARCEL2GO_BASE_URL || 'https://api.parcel2go.com';
const PARCEL2GO_AUTH_URL = `${PARCEL2GO_BASE_URL}/auth/connect/token`;

export interface Parcel2GoCredentials {
  clientId: string;
  clientSecret: string;
}

export interface ParcelDimensions {
  weight: number; // in kg
  length: number; // in cm
  width: number;  // in cm
  height: number; // in cm
  value: number;  // declared value in pounds
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

  private async getAccessToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Parcel2Go credentials not configured');
    }

    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(PARCEL2GO_AUTH_URL, 
        new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'public-api',
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': '*/*'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry to 90% of the actual expiry time for safety
      const expiresIn = response.data.expires_in * 0.9;
      this.tokenExpiry = new Date(Date.now() + (expiresIn * 1000));

      return this.accessToken;
    } catch (error: any) {
      console.error('Failed to get Parcel2Go access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Parcel2Go API');
    }
  }

  private async makeRequest(endpoint: string, data?: any, method: 'GET' | 'POST' = 'GET') {
    const token = await this.getAccessToken();
    const url = `${PARCEL2GO_BASE_URL}/api${endpoint}`;

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
        Height: parcel.height
      })),
      ...(request.collectionDate && { CollectionDate: request.collectionDate })
    };

    const response = await this.makeRequest('/quotes', requestData, 'POST');

    return response.Services?.map((service: any) => ({
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
      description: service.Description || service.Name
    })) || [];
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
  clientSecret: process.env.PARCEL2GO_CLIENT_SECRET || ''
});