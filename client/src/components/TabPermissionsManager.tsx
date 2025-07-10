import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useTabPermissions, useUpdateTabPermission } from '@/hooks/useTabPermissions';
import { useToast } from '@/hooks/use-toast';
import { 
  Home, 
  Package, 
  ShoppingCart, 
  Users, 
  MessageSquare, 
  BarChart3, 
  Store, 
  Settings,
  UserCog,
  CreditCard,
  Lock,
  Shield
} from 'lucide-react';

const TAB_CONFIGS = [
  { 
    name: 'dashboard', 
    label: 'Dashboard', 
    icon: Home,
    description: 'Main dashboard with overview and quick actions'
  },
  { 
    name: 'products', 
    label: 'Products', 
    icon: Package,
    description: 'Product management, inventory, and pricing'
  },
  { 
    name: 'orders', 
    label: 'Orders', 
    icon: ShoppingCart,
    description: 'Order processing and management'
  },
  { 
    name: 'customers', 
    label: 'Customer Groups', 
    icon: Users,
    description: 'Customer management and group organization'
  },
  { 
    name: 'campaigns', 
    label: 'Campaigns', 
    icon: MessageSquare,
    description: 'WhatsApp broadcasting and messaging'
  },
  { 
    name: 'analytics', 
    label: 'Business Performance', 
    icon: BarChart3,
    description: 'Analytics, reports, and financial insights'
  },
  { 
    name: 'marketplace', 
    label: 'Marketplace', 
    icon: Store,
    description: 'B2B marketplace access (Premium only)'
  },
  { 
    name: 'team-management', 
    label: 'Team Management', 
    icon: UserCog,
    description: 'Team member invitations and management'
  },
  { 
    name: 'subscription', 
    label: 'Subscription', 
    icon: CreditCard,
    description: 'Subscription plans and billing management'
  },
  { 
    name: 'settings', 
    label: 'Settings', 
    icon: Settings,
    description: 'Business settings and configuration'
  }
];

export default function TabPermissionsManager() {
  const { data: permissions = [], isLoading } = useTabPermissions();
  const updatePermission = useUpdateTabPermission();
  const { toast } = useToast();
  const [updating, setUpdating] = useState<string | null>(null);

  const handlePermissionChange = async (tabName: string, isRestricted: boolean) => {
    setUpdating(tabName);
    
    try {
      console.log('Updating permission:', { tabName, isRestricted });
      
      const result = await updatePermission.mutateAsync({
        tabName,
        isRestricted,
        allowedRoles: isRestricted ? ['owner', 'admin'] : ['owner', 'admin', 'member']
      });
      
      console.log('Permission update result:', result);
      
      toast({
        title: "Permissions Updated",
        description: `${TAB_CONFIGS.find(t => t.name === tabName)?.label} access ${isRestricted ? 'restricted' : 'allowed'} for team members`,
      });
    } catch (error) {
      console.error('Permission update error:', error);
      toast({
        title: "Error",
        description: `Failed to update permissions: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setUpdating(null);
    }
  };

  const getPermissionForTab = (tabName: string) => {
    return permissions.find(p => p.tabName === tabName);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-200 rounded animate-pulse" />
                  <div className="space-y-1">
                    <div className="w-32 h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="w-48 h-3 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
                <div className="w-12 h-6 bg-gray-200 rounded animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Shield className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold">Tab Access Permissions</h3>
      </div>

      <Alert>
        <Lock className="w-4 h-4" />
        <AlertDescription>
          Control which dashboard tabs your team members can access. Restricted tabs will be hidden from team member navigation.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        {TAB_CONFIGS.map((tab) => {
          const permission = getPermissionForTab(tab.name);
          const isRestricted = permission?.isRestricted || false;
          const Icon = tab.icon;
          const isUpdating = updating === tab.name;

          return (
            <Card key={tab.name} className="transition-all hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <Icon className={`w-6 h-6 ${isRestricted ? 'text-red-500' : 'text-green-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-gray-900">{tab.label}</h4>
                        {isRestricted && (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            <Lock className="w-3 h-3 mr-1" />
                            Restricted
                          </Badge>
                        )}
                        {!isRestricted && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Open Access
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{tab.description}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Switch
                      checked={isRestricted}
                      onCheckedChange={(checked) => handlePermissionChange(tab.name, checked)}
                      disabled={isUpdating}
                      className="data-[state=checked]:bg-red-500"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Permission Summary</h4>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <span>Open Access: Team members can view and use these tabs</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
            <span>Restricted: Only business owners can access these tabs</span>
          </div>
        </div>
      </div>
    </div>
  );
}