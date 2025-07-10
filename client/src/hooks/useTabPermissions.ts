import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface TabPermission {
  id: number;
  wholesalerId: string;
  tabName: string;
  isRestricted: boolean;
  allowedRoles: string[];
  createdAt: string;
  updatedAt: string;
}

export function useTabPermissions() {
  return useQuery<TabPermission[]>({
    queryKey: ['/api/tab-permissions'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUpdateTabPermission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ tabName, isRestricted, allowedRoles }: {
      tabName: string;
      isRestricted: boolean;
      allowedRoles?: string[];
    }) => {
      const response = await apiRequest('PUT', `/api/tab-permissions/${tabName}`, { isRestricted, allowedRoles });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tab-permissions'] });
    },
  });
}

export function useCheckTabAccess(tabName: string) {
  return useQuery<{ hasAccess: boolean }>({
    queryKey: ['/api/tab-permissions/check', tabName],
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!tabName,
  });
}