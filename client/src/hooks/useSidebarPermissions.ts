import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface NavigationItem {
  name: string;
  href: string;
  tabName: string;
  icon?: any;
  disabled?: boolean;
  premiumOnly?: boolean;
}

export function useSidebarPermissions() {
  const { user } = useAuth();

  // For team members, fetch permissions using their wholesaler ID check endpoint
  const { data: permissionChecks = {}, isLoading: permissionsLoading } = useQuery<Record<string, boolean>>({
    queryKey: ['/api/tab-permissions/check-all'],
    enabled: user?.role === 'team_member',
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const checkTabAccess = (tabName: string): boolean => {
    // If user is not a team member (i.e., they're the owner), they have full access
    if (user?.role !== 'team_member') {
      return true;
    }

    // While permissions are loading, hide tabs (avoid flash of restricted content)
    if (permissionsLoading) {
      return false;
    }

    // Once loaded, only show if the backend explicitly returned true
    // Any absent key or false value = restricted
    return permissionChecks[tabName] === true;
  };

  const filterNavigationItems = (items: NavigationItem[]): NavigationItem[] => {
    return items.filter(item => {
      // Check if tab is accessible based on permissions
      return checkTabAccess(item.tabName);
    });
  };

  const isTabRestricted = (tabName: string): boolean => {
    if (user?.role !== 'team_member') {
      return false; // Owners can always see restriction status
    }
    return !checkTabAccess(tabName);
  };

  return {
    checkTabAccess,
    filterNavigationItems,
    isTabRestricted,
    permissionChecks,
    permissionsLoading,
  };
}

// Helper function to get tab name from route path
export function getTabNameFromPath(path: string): string {
  // Remove leading slash and get first segment
  const segments = path.replace(/^\//, '').split('/');
  const firstSegment = segments[0];
  
  // Map paths to tab names
  const pathToTabMap: Record<string, string> = {
    '': 'dashboard',
    'dashboard': 'dashboard',
    'products': 'products',
    'promotions': 'promotions',
    'orders': 'orders',
    'customers': 'customers',
    'campaigns': 'campaigns',
    'integrations': 'integrations',
    'marketplace': 'marketplace',
    'team-management': 'team-management',
    'financials': 'finance',
    'subscription-pricing': 'subscription',
    'settings': 'settings',
    'help': 'settings',
  };
  
  return pathToTabMap[firstSegment] || firstSegment;
}
