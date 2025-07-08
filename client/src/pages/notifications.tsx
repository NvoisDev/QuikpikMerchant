import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle, AlertCircle, Clock, Users, Package, MessageSquare } from "lucide-react";

export default function Notifications() {
  // Mock notifications data - in real app this would come from API
  const notifications = [
    {
      id: 1,
      type: "stock_alert",
      title: "Low Stock Alert",
      message: "Product 'Premium Rice' is running low (5 units left)",
      timestamp: "2 minutes ago",
      isRead: false,
      icon: Package,
      color: "text-red-500"
    },
    {
      id: 2,
      type: "new_order",
      title: "New Order Received",
      message: "Order #1234 from John's Store for £150.00",
      timestamp: "1 hour ago",
      isRead: false,
      icon: CheckCircle,
      color: "text-green-500"
    },
    {
      id: 3,
      type: "team_member",
      title: "Team Member Joined",
      message: "Sarah Johnson has joined your team",
      timestamp: "3 hours ago",
      isRead: true,
      icon: Users,
      color: "text-blue-500"
    },
    {
      id: 4,
      type: "campaign",
      title: "Campaign Sent",
      message: "WhatsApp campaign 'New Stock Alert' sent to 25 customers",
      timestamp: "1 day ago",
      isRead: true,
      icon: MessageSquare,
      color: "text-purple-500"
    },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 mt-1">
            Stay updated with your business activities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-gray-500" />
          <Badge variant="outline">
            {notifications.filter(n => !n.isRead).length} unread
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        {notifications.map((notification) => {
          const IconComponent = notification.icon;
          return (
            <Card key={notification.id} className={`${!notification.isRead ? 'bg-blue-50 border-blue-200' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-full bg-gray-100 ${notification.color}`}>
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">{notification.timestamp}</span>
                        {!notification.isRead && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-600 mt-1">{notification.message}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {notifications.length === 0 && (
        <div className="text-center py-12">
          <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications yet</h3>
          <p className="text-gray-600">
            You'll see important updates about your business here.
          </p>
        </div>
      )}
    </div>
  );
}