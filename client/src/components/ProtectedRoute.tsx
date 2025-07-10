import { useCheckTabAccess } from '@/hooks/useTabPermissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Lock, AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  tabName: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({ tabName, children, fallback }: ProtectedRouteProps) {
  const { user } = useAuth();
  const { data: accessData, isLoading } = useCheckTabAccess(tabName);

  // If loading, show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // If user is not team member, always allow access (owner has full access)
  if (user?.role !== 'team_member') {
    return <>{children}</>;
  }

  // If team member doesn't have access, show restriction message
  if (!accessData?.hasAccess) {
    return fallback || (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="mb-4">
              <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Access Restricted
            </h3>
            <p className="text-gray-600 mb-4">
              You don't have permission to access this section. Please contact your business owner for access.
            </p>
            <div className="text-sm text-gray-500">
              Tab: <span className="font-medium">{tabName}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User has access, show the content
  return <>{children}</>;
}