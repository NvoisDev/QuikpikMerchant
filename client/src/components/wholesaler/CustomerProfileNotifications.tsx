import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, User, Mail, Phone, Building, Clock, Check } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface CustomerProfileNotification {
  id: number;
  customerId: string;
  updateType: 'name' | 'email' | 'phone' | 'business_name';
  oldValue: string;
  newValue: string;
  changesApplied: any;
  createdAt: string;
  readAt?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export function CustomerProfileNotifications() {
  const { toast } = useToast();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['/api/wholesaler/customer-update-notifications'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await apiRequest("PATCH", `/api/wholesaler/customer-update-notifications/${notificationId}/read`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wholesaler/customer-update-notifications'] });
      toast({
        title: "Notification Marked as Read",
        description: "The notification has been marked as read.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: "Failed to mark notification as read. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getUpdateTypeIcon = (updateType: string) => {
    switch (updateType) {
      case 'name':
        return <User className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'phone':
        return <Phone className="h-4 w-4" />;
      case 'business_name':
        return <Building className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getUpdateTypeLabel = (updateType: string) => {
    switch (updateType) {
      case 'name':
        return 'Name Changed';
      case 'email':
        return 'Email Updated';
      case 'phone':
        return 'Phone Updated';
      case 'business_name':
        return 'Business Name Changed';
      default:
        return 'Profile Updated';
    }
  };

  const handleMarkAsRead = (notificationId: number) => {
    markAsReadMutation.mutate(notificationId);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Customer Profile Updates
          </CardTitle>
          <CardDescription>
            Stay informed when your customers update their profile information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading notifications...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const notificationList = (notifications as any)?.notifications || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Customer Profile Updates
          {notificationList.filter((n: CustomerProfileNotification) => !n.readAt).length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {notificationList.filter((n: CustomerProfileNotification) => !n.readAt).length} New
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Stay informed when your customers update their profile information
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notificationList.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No profile updates yet</p>
            <p className="text-sm text-gray-400 mt-1">
              You'll be notified when customers update their profile information
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notificationList.map((notification: CustomerProfileNotification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border ${
                  notification.readAt 
                    ? 'border-gray-200 bg-gray-50' 
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      notification.readAt 
                        ? 'bg-gray-200 text-gray-600' 
                        : 'bg-blue-100 text-blue-600'
                    }`}>
                      {getUpdateTypeIcon(notification.updateType)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">
                          {notification.customerName || 'Unknown Customer'}
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {getUpdateTypeLabel(notification.updateType)}
                        </Badge>
                        {!notification.readAt && (
                          <Badge variant="destructive" className="text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          <span className="font-medium">Changed from:</span>{' '}
                          <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                            {notification.oldValue || 'Not set'}
                          </span>
                        </p>
                        <p>
                          <span className="font-medium">Changed to:</span>{' '}
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                            {notification.newValue}
                          </span>
                        </p>
                        
                        {/* Additional customer contact info */}
                        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-200">
                          {notification.customerEmail && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {notification.customerEmail}
                            </span>
                          )}
                          {notification.customerPhone && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {notification.customerPhone}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        {notification.readAt && (
                          <span className="flex items-center gap-1 ml-3">
                            <Check className="h-3 w-3 text-green-500" />
                            Read {formatDistanceToNow(new Date(notification.readAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {!notification.readAt && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkAsRead(notification.id)}
                      disabled={markAsReadMutation.isPending}
                    >
                      Mark as Read
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}