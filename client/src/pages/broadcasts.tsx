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
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const form = useForm<BroadcastFormData>({
    resolver: zodResolver(broadcastFormSchema),
    defaultValues: {
      productId: "",
      customerGroupId: "",
      customMessage: "",
      scheduledAt: "",
    },
  });

  // Fetch broadcasts
  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ["/api/broadcasts"],
    enabled: !!user,
  });

  // Fetch broadcast stats
  const { data: broadcastStats = { totalBroadcasts: 0, recipientsReached: 0, avgOpenRate: 0 } } = useQuery({
    queryKey: ["/api/broadcasts/stats"],
    enabled: !!user,
  });

  // Fetch products and customer groups for form
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: !!user,
  });

  const { data: customerGroups = [] } = useQuery<CustomerGroup[]>({
    queryKey: ["/api/customer-groups"],
    enabled: !!user,
  });

  const broadcastMutation = useMutation({
    mutationFn: async (data: BroadcastFormData) => {
      const response = await apiRequest("POST", "/api/broadcasts", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/broadcasts/stats"] });
      toast({
        title: "Success",
        description: "Broadcast sent successfully",
      });
      setIsDialogOpen(false);
      form.reset();
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
        title: "Error",
        description: error.message || "Failed to send broadcast",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BroadcastFormData) => {
    broadcastMutation.mutate(data);
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Broadcasts</h1>
          <p className="text-gray-600 mt-1">Send product updates to your customer groups</p>
        </div>
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
                            {customerGroups?.map((group: any) => (
                              <SelectItem key={group.id} value={group.id.toString()}>
                                {group.name} ({group.memberCount || 0} members)
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
                          placeholder="Add a custom message to go with the product details..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={broadcastMutation.isPending}>
                    {broadcastMutation.isPending ? "Sending..." : "Send Broadcast"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <p className="text-sm font-medium text-gray-600">Avg Open Rate</p>
                <p className="text-2xl font-bold text-gray-900">{broadcastStats.avgOpenRate}%</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Broadcast List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Broadcasts</CardTitle>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : filteredBroadcasts.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No broadcasts found</h3>
              <p className="text-gray-600 mb-4">Start by creating your first broadcast to reach your customers</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Broadcast
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBroadcasts.map((broadcast: Broadcast) => (
                <div key={broadcast.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{broadcast.product.name}</h4>
                      <p className="text-sm text-gray-600">To: {broadcast.customerGroup.name}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(broadcast.status)}
                      <span className="text-sm text-gray-500">
                        {broadcast.recipientCount} recipients
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{broadcast.message}</p>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>Sent: {new Date(broadcast.sentAt).toLocaleString()}</span>
                    {broadcast.openRate && (
                      <span className="flex items-center">
                        <Eye className="w-3 h-3 mr-1" />
                        {broadcast.openRate}% opened
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}