import { useState, useEffect, useMemo } from 'react';
import { useOptimizedQuery } from './useOptimizedQuery';

interface Order {
  id: number;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  total: string;
  platformFee?: string;
  status: string;
  createdAt: string;
  fulfillmentType?: string;
  deliveryAddress?: string;
  subtotal?: string;
  deliveryCost?: string;
  items?: OrderItem[];
}

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: string;
  total: string;
  product: {
    id: number;
    name: string;
    imageUrl?: string;
    moq?: number;
  };
}

interface UseOrdersOptimizedOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  enabled?: boolean;
}

export function useOrdersOptimized(options: UseOrdersOptimizedOptions = {}) {
  const { page = 1, limit = 20, search = '', status = '', enabled = true } = options;

  // Memoize query key to prevent unnecessary refetches
  const queryKey = useMemo(() => [
    '/api/orders',
    page,
    limit,
    search,
    status
  ].filter(Boolean), [page, limit, search, status]);

  const { data, isLoading, error, refetch } = useOptimizedQuery<{
    orders: Order[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }>({
    queryKey,
    enabled: enabled,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search }),
        ...(status && { status })
      });

      const response = await fetch(`/api/orders?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.statusText}`);
      }

      return response.json();
    },
  });

  // Calculate statistics from the data
  const statistics = useMemo(() => {
    if (!data?.orders) return null;
    
    const orders = data.orders;
    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total || '0'), 0);
    const completedOrders = orders.filter(order => order.status === 'completed').length;
    const pendingOrders = orders.filter(order => order.status === 'pending').length;
    
    return {
      totalOrders: orders.length,
      totalRevenue,
      completedOrders,
      pendingOrders,
      avgOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0
    };
  }, [data?.orders]);

  return {
    orders: data?.orders || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 0,
    currentPage: data?.currentPage || page,
    statistics,
    isLoading,
    error,
    refetch
  };
}