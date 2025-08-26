import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  UserPlus, 
  Clock, 
  CheckCircle, 
  XCircle,
  Building2,
  Phone,
  Mail,
  MessageSquare,
  Users,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";

interface RegistrationRequest {
  id: number;
  wholesalerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  businessName?: string;
  requestMessage?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  respondedAt?: string;
  responseMessage?: string;
}

interface CustomerGroup {
  id: number;
  name: string;
  description?: string;
  memberCount: number;
}

export default function CustomerRegistrationRequests() {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<RegistrationRequest | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch registration requests
  const { data: requests = [], isLoading, refetch } = useQuery<RegistrationRequest[]>({
    queryKey: ['/api/registration-requests'],
    refetchInterval: 30000, // Refresh every 30 seconds for new requests
  });

  // Fetch customer groups for approval workflow
  const { data: customerGroups = [] } = useQuery<CustomerGroup[]>({
    queryKey: ['/api/customer-groups'],
  });

  // Mutation for approving/rejecting requests
  const respondToRequestMutation = useMutation({
    mutationFn: async ({ requestId, action, responseMessage, customerGroupId }: {
      requestId: number;
      action: 'approve' | 'reject';
      responseMessage?: string;
      customerGroupId?: number;
    }) => {
      const response = await fetch(`/api/registration-requests/${requestId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, responseMessage, customerGroupId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process request');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Request Processed",
        description: data.message,
      });
      setSelectedRequest(null);
      setResponseMessage("");
      setSelectedGroupId("");
      refetch(); // Refresh the list
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsProcessing(false);
    }
  });

  const handleApprove = () => {
    if (!selectedRequest) return;
    setIsProcessing(true);
    
    respondToRequestMutation.mutate({
      requestId: selectedRequest.id,
      action: 'approve',
      responseMessage: responseMessage || undefined,
      customerGroupId: selectedGroupId ? parseInt(selectedGroupId) : undefined,
    });
  };

  const handleReject = () => {
    if (!selectedRequest) return;
    setIsProcessing(true);
    
    respondToRequestMutation.mutate({
      requestId: selectedRequest.id,
      action: 'reject',
      responseMessage: responseMessage || undefined,
    });
  };

  // Filter requests based on search query
  const filteredRequests = requests.filter(req => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      req.customerName?.toLowerCase().includes(query) ||
      req.businessName?.toLowerCase().includes(query) ||
      req.customerPhone?.includes(query) ||
      req.customerEmail?.toLowerCase().includes(query)
    );
  });

  const pendingRequests = filteredRequests.filter(req => req.status === 'pending');
  const processedRequests = filteredRequests.filter(req => req.status !== 'pending');

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/customers">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Customers
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Customer Registration Requests</h1>
            <p className="text-muted-foreground">
              Review and approve customer access requests
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {/* Search functionality */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, business, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-80"
            />
          </div>
          <Badge variant="secondary" className="px-3 py-1">
            {pendingRequests.length} Pending
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <Clock className="h-8 w-8 text-amber-500 mr-4" />
            <div>
              <p className="text-2xl font-bold">{pendingRequests.length}</p>
              <p className="text-sm text-muted-foreground">Pending Requests</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center p-6">
            <CheckCircle className="h-8 w-8 text-green-500 mr-4" />
            <div>
              <p className="text-2xl font-bold">
                {processedRequests.filter(r => r.status === 'approved').length}
              </p>
              <p className="text-sm text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center p-6">
            <XCircle className="h-8 w-8 text-red-500 mr-4" />
            <div>
              <p className="text-2xl font-bold">
                {processedRequests.filter(r => r.status === 'rejected').length}
              </p>
              <p className="text-sm text-muted-foreground">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 text-amber-500" />
              Pending Requests
            </CardTitle>
            <CardDescription>
              New customer registration requests awaiting your review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <UserPlus className="h-4 w-4 text-blue-500" />
                        <h3 className="font-semibold">{request.customerName}</h3>
                        {request.businessName && (
                          <Badge variant="outline">
                            <Building2 className="h-3 w-3 mr-1" />
                            {request.businessName}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Phone className="h-3 w-3 mr-1" />
                          {request.customerPhone}
                        </div>
                        {request.customerEmail && (
                          <div className="flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {request.customerEmail}
                          </div>
                        )}
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {format(new Date(request.requestedAt), 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                      
                      {request.requestMessage && (
                        <div className="flex items-start space-x-2 mt-2">
                          <MessageSquare className="h-3 w-3 mt-1 text-gray-500" />
                          <p className="text-sm text-gray-600 italic">
                            "{request.requestMessage}"
                          </p>
                        </div>
                      )}
                    </div>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm"
                          onClick={() => setSelectedRequest(request)}
                        >
                          Review
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle>Review Registration Request</DialogTitle>
                          <DialogDescription>
                            Decide whether to approve or reject {request.customerName}'s access request.
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                          {/* Customer Details */}
                          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                            <h4 className="font-medium">Customer Details</h4>
                            <div className="text-sm space-y-1">
                              <p><strong>Name:</strong> {request.customerName}</p>
                              {request.businessName && (
                                <p><strong>Business:</strong> {request.businessName}</p>
                              )}
                              <p><strong>Phone:</strong> {request.customerPhone}</p>
                              {request.customerEmail && (
                                <p><strong>Email:</strong> {request.customerEmail}</p>
                              )}
                              <p><strong>Requested:</strong> {format(new Date(request.requestedAt), 'MMM d, yyyy h:mm a')}</p>
                            </div>
                            {request.requestMessage && (
                              <div className="mt-2">
                                <strong>Message:</strong>
                                <p className="italic text-gray-600 mt-1">"{request.requestMessage}"</p>
                              </div>
                            )}
                          </div>
                          
                          {/* Customer Group Selection (for approval) */}
                          <div>
                            <Label htmlFor="customerGroup">Add to Customer Group (Optional)</Label>
                            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a customer group" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">No group</SelectItem>
                                {customerGroups.map((group) => (
                                  <SelectItem key={group.id} value={group.id.toString()}>
                                    <div className="flex items-center">
                                      <Users className="h-3 w-3 mr-2" />
                                      {group.name} ({group.memberCount} members)
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Response Message */}
                          <div>
                            <Label htmlFor="responseMessage">Response Message (Optional)</Label>
                            <Textarea
                              id="responseMessage"
                              placeholder="Add a personal message to send with your decision..."
                              value={responseMessage}
                              onChange={(e) => setResponseMessage(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        
                        <DialogFooter className="space-x-2">
                          <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={isProcessing}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            onClick={handleApprove}
                            disabled={isProcessing}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve & Create Account
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <UserPlus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No pending requests</h3>
            <p className="text-gray-500">
              All customer registration requests have been processed.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recently Processed Requests */}
      {processedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently Processed</CardTitle>
            <CardDescription>
              Previously approved and rejected registration requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processedRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center space-x-3">
                    {request.status === 'approved' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">{request.customerName}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.customerPhone} • {format(new Date(request.respondedAt!), 'MMM d')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={request.status === 'approved' ? 'default' : 'destructive'}>
                    {request.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}