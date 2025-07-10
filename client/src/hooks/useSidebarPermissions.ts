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

  // Fetch all tab permissions for this user's wholesaler
  const { data: tabPermissions = [] } = useQuery({
    queryKey: ['/api/tab-permissions'],
    enabled: user?.role !== 'team_member', // Only fetch if user is owner
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const checkTabAccess = (tabName: string): boolean => {
    // If user is not a team member (i.e., they're the owner), they have full access
    if (user?.role !== 'team_member') {
      return true;
    }

    // For team members, we'll default to allowing access
    // The individual tab checks will be handled by the ProtectedRoute component
    return true;
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
    tabPermissions,
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
    'orders': 'orders',
    'customers': 'customers',
    'campaigns': 'campaigns',
    'business-performance': 'analytics',
    'marketplace': 'marketplace',
    'team-management': 'team-management',
    'settings': 'settings',
  };
  
  return pathToTabMap[firstSegment] || firstSegment;
}