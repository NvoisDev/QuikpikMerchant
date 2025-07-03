import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import { 
  MessageSquare, 
  Send, 
  Users, 
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  BarChart3
} from "lucide-react";
import type { CustomerGroup, Product } from "@shared/schema";

const broadcastFormSchema = z.object({
  productId: z.string().min(1, "Please select a product"),
  customerGroupId: z.string().min(1, "Please select a customer group"),
  customMessage: z.string().optional(),
  scheduledAt: z.string().optional(),
});

type BroadcastFormData = z.infer<typeof broadcastFormSchema>;

interface Broadcast {
  id: number;
  productId: number;
  customerGroupId: number;
  message: string;
  sentAt: string;
  status: 'pending' | 'sent' | 'failed';
  recipientCount: number;
  openRate?: number;
  clickRate?: number;
  product: {
    name: string;
    imageUrl?: string;
  };
  customerGroup: {
    name: string;
  };
}

export default function Broadcasts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const form = useForm<BroadcastFormData>({
    resolver: zodResolver(broadcastFormSchema),
    defaultValues: {
      productId: "",
      customerGroupId: "",
      customMessage: "",
      scheduledAt: "",
    },
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: !!user?.id,
  });

  const { data: customerGroups = [], isLoading: groupsLoading } = useQuery<CustomerGroup[]>({
    queryKey: ["/api/customer-groups"],
    enabled: !!user?.id,
  });

  const { data: broadcasts = [], isLoading: broadcastsLoading } = useQuery<Broadcast[]>({
    queryKey: ["/api/broadcasts"],
    enabled: !!user?.id,
  });

  const { data: broadcastStats = { totalBroadcasts: 0, recipientsReached: 0, avgOpenRate: 0 } } = useQuery<{
    totalBroadcasts: number;
    recipientsReached: number;
    avgOpenRate: number;
  }>({
    queryKey: ["/api/broadcasts/stats"],
    enabled: !!user?.id,
  });

  const sendBroadcastMutation = useMutation({
    mutationFn: async (data: BroadcastFormData) => {
      return await apiRequest("POST", "/api/broadcasts", {
        productId: parseInt(data.productId),
        customerGroupId: parseInt(data.customerGroupId),
        customMessage: data.customMessage,
        scheduledAt: data.scheduledAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/broadcasts/stats"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Broadcast Sent",
        description: "Your WhatsApp broadcast has been sent successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Broadcast Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BroadcastFormData) => {
    sendBroadcastMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const filteredBroadcasts = broadcasts?.filter(broadcast => 
    filterStatus === "all" || broadcast.status === filterStatus
  ) || [];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 lg:ml-64">
        {/* Top Bar */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">WhatsApp Broadcasts</h1>
              <p className="text-gray-600 mt-1">Send product updates to your customer groups</p>
            </div>
            <div className="flex items-center space-x-4">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Broadcast
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create WhatsApp Broadcast</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="productId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Product</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {products?.filter((p: any) => p.status === 'active').map((product: any) => (
                                    <SelectItem key={product.id} value={product.id.toString()}>
                                      {product.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="customerGroupId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Customer Group</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select customer group" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {customerGroups && customerGroups.map((group) => (
                                    <SelectItem key={group.id} value={group.id.toString()}>
                                      {group.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="customMessage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Custom Message (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Add a custom message or leave blank for auto-generated message..."
                                className="min-h-[100px]"
                                {...field} 
                              />
                            </FormControl>
                            <div className="text-sm text-gray-500">
                              Leave blank to use auto-generated message with product details
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-900 mb-2">Preview Message</h4>
                        <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                          <p className="font-medium">🛍️ Fresh Red Apples is now available!</p>
                          <p className="mt-2">📦 Stock: 50 units</p>
                          <p>💰 Price: $2.50</p>
                          <p>📋 Min Order: 10 units</p>
                          <p className="mt-2">🛒 Order now: [Product Link]</p>
                          <p className="mt-2 text-xs text-gray-500">Reply STOP to unsubscribe</p>
                        </div>
                      </div>

                      <div className="flex justify-end space-x-4">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setIsDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={sendBroadcastMutation.isPending}
                        >
                          {sendBroadcastMutation.isPending ? (
                            <>
                              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              Send Broadcast
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Broadcasts</p>
                    <p className="text-2xl font-bold text-gray-900">{broadcastStats.totalBroadcasts}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <MessageSquare className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Recipients Reached</p>
                    <p className="text-2xl font-bold text-gray-900">{broadcastStats.recipientsReached}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg. Open Rate</p>
                    <p className="text-2xl font-bold text-gray-900">{broadcastStats.avgOpenRate}%</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Eye className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Performance</p>
                    <p className="text-2xl font-bold text-gray-900">Excellent</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex space-x-4">
              <Button
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("all")}
              >
                All Broadcasts
              </Button>
              <Button
                variant={filterStatus === "sent" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("sent")}
              >
                Sent
              </Button>
              <Button
                variant={filterStatus === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("pending")}
              >
                Pending
              </Button>
              <Button
                variant={filterStatus === "failed" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("failed")}
              >
                Failed
              </Button>
            </div>
          </div>

          {/* Broadcasts List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Broadcasts</CardTitle>
            </CardHeader>
            <CardContent>
              {broadcastsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-4 p-4">
                      <div className="w-16 h-16 bg-gray-300 rounded-lg"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBroadcasts.map((broadcast) => (
                    <div key={broadcast.id} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <img 
                        src={broadcast.product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=64&h=64&fit=crop"} 
                        alt={broadcast.product.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-medium text-gray-900">{broadcast.product.name}</h4>
                          {getStatusBadge(broadcast.status)}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{broadcast.customerGroup.name}</p>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{broadcast.message}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span>{broadcast.recipientCount} recipients</span>
                          {broadcast.openRate && (
                            <span>{broadcast.openRate}% open rate</span>
                          )}
                          {broadcast.clickRate && (
                            <span>{broadcast.clickRate}% click rate</span>
                          )}
                          <span>{new Date(broadcast.sentAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {!broadcastsLoading && filteredBroadcasts.length === 0 && (
                <div className="text-center py-12">
                  <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">No broadcasts found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Get started by creating your first broadcast
                  </p>
                  <div className="mt-6">
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Broadcast
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}