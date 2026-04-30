import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import ElephantLoader from "@/components/ui/elephant-loader";
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
import { Input } from "@/components/ui/input";
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
  AlertCircle,
  Search,
  MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

interface RegistrationRequest {
  id: number;
  wholesalerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  businessName?: string;
  businessType?: string;
  requestMessage?: string;
  productsInterested?: string;
  orderFrequency?: string;
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
  const [selectedGroupId, setSelectedGroupId] = useState<string>("none");
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingRequest, setViewingRequest] = useState<RegistrationRequest | null>(null);

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
      customerGroupId: selectedGroupId && selectedGroupId !== "none" ? parseInt(selectedGroupId) : undefined,
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

  // Filter requests based on search query - ensure requests is an array
  const filteredRequests = (requests || [])
    .filter(req => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        req.customerName?.toLowerCase().includes(query) ||
        req.businessName?.toLowerCase().includes(query) ||
        req.customerPhone?.includes(query) ||
        req.customerEmail?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));

  const pendingRequests = (filteredRequests || []).filter(req => req.status === 'pending');
  const processedRequests = (filteredRequests || []).filter(req => req.status !== 'pending');

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <ElephantLoader message="Loading registration requests..." />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="bg-white min-h-screen">
      <PageHeader title="Registration Requests" description="Review and approve customer access requests" />
      <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/customers">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Back to Customers</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
          </div>
          <Badge variant="secondary" className="px-3 py-1 hidden sm:flex">
            {pendingRequests.length} Pending
          </Badge>
        </div>
        
        {/* Mobile-friendly search bar */}
        <div className="flex items-center justify-between space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Badge variant="secondary" className="px-3 py-1 sm:hidden flex-shrink-0">
            {pendingRequests.length} Pending
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card>
          <CardContent className="flex items-center p-3 sm:p-6">
            <Clock className="h-5 w-5 sm:h-8 sm:w-8 text-amber-500 mr-2 sm:mr-4 flex-shrink-0" />
            <div>
              <p className="text-lg sm:text-2xl font-bold">{pendingRequests.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-tight">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center p-3 sm:p-6">
            <CheckCircle className="h-5 w-5 sm:h-8 sm:w-8 text-green-500 mr-2 sm:mr-4 flex-shrink-0" />
            <div>
              <p className="text-lg sm:text-2xl font-bold">
                {processedRequests.filter(r => r.status === 'approved').length}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-tight">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center p-3 sm:p-6">
            <XCircle className="h-5 w-5 sm:h-8 sm:w-8 text-red-500 mr-2 sm:mr-4 flex-shrink-0" />
            <div>
              <p className="text-lg sm:text-2xl font-bold">
                {processedRequests.filter(r => r.status === 'rejected').length}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-tight">Rejected</p>
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
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-3 sm:space-y-0">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
                        <div className="flex items-center space-x-2">
                          <UserPlus className="h-4 w-4 text-blue-500" />
                          <h3 className="font-semibold">{request.customerName}</h3>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-4 text-sm text-muted-foreground">
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
                          <span className="hidden sm:inline">{format(new Date(request.requestedAt), 'MMM d, yyyy h:mm a')}</span>
                          <span className="sm:hidden">{format(new Date(request.requestedAt), 'MMM d')}</span>
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
                      {request.productsInterested && (
                        <div className="flex items-start space-x-2 mt-1">
                          <span className="text-gray-400 mt-0.5 text-xs">📦</span>
                          <p className="text-sm text-gray-600"><strong>Products:</strong> {request.productsInterested}</p>
                        </div>
                      )}
                      {request.orderFrequency && (
                        <div className="flex items-start space-x-2 mt-1">
                          <span className="text-gray-400 mt-0.5 text-xs">🔁</span>
                          <p className="text-sm text-gray-600"><strong>Frequency:</strong> {request.orderFrequency}</p>
                        </div>
                      )}
                    </div>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm"
                          onClick={() => setSelectedRequest(request)}
                          className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          <span className="hidden sm:inline">Review Request</span>
                          <span className="sm:hidden">Review</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                            {request.productsInterested && (
                              <div className="mt-1">
                                <strong>Products Interested In:</strong>
                                <p className="text-gray-600 mt-0.5">{request.productsInterested}</p>
                              </div>
                            )}
                            {request.orderFrequency && (
                              <div className="mt-1">
                                <strong>Order Frequency:</strong>
                                <p className="text-gray-600 mt-0.5">{request.orderFrequency}</p>
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
                                <SelectItem value="none">No group</SelectItem>
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
                        
                        <DialogFooter className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                          <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={isProcessing}
                            className="w-full sm:w-auto"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            onClick={handleApprove}
                            disabled={isProcessing}
                            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            <span className="hidden sm:inline">Approve & Create Account</span>
                            <span className="sm:hidden">Approve</span>
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
            {searchQuery && (requests || []).length > 0 ? (
              <>
                <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No matching requests</h3>
                <p className="text-gray-500">
                  No pending requests match your search: "{searchQuery}"
                </p>
              </>
            ) : (
              <>
                <UserPlus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No pending requests</h3>
                <p className="text-gray-500">
                  All customer registration requests have been processed.
                </p>
              </>
            )}
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
              {processedRequests.slice(0, 10).map((request) => (
                <div key={request.id} className="py-3 border-b last:border-0 space-y-1.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors" onClick={() => setViewingRequest(request)}>
                  {/* Row 1: icon + name + badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {request.status === 'approved' ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <p className="font-medium">{request.customerName}</p>
                    </div>
                    <Badge variant={request.status === 'approved' ? 'default' : 'destructive'} className="text-xs">
                      {request.status}
                    </Badge>
                  </div>
                  {/* Row 2: phone/date + action buttons */}
                  <div className="flex items-center justify-between pl-6">
                    <p className="text-xs text-muted-foreground">
                      {request.customerPhone}
                      {request.respondedAt ? ` • ${format(new Date(request.respondedAt), 'MMM d')}` : ''}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewingRequest(request)}>
                          View details
                        </DropdownMenuItem>
                        {request.status === 'rejected' && (
                          <DropdownMenuItem
                            className="text-green-600"
                            disabled={respondToRequestMutation.isPending}
                            onClick={() => respondToRequestMutation.mutate({ requestId: request.id, action: 'approve' })}
                          >
                            Re-approve
                          </DropdownMenuItem>
                        )}
                        {request.status === 'approved' && (
                          <DropdownMenuItem
                            className="text-red-600"
                            disabled={respondToRequestMutation.isPending}
                            onClick={() => respondToRequestMutation.mutate({ requestId: request.id, action: 'reject' })}
                          >
                            Revoke
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>

    {/* View Full Details Dialog */}
    <Dialog open={!!viewingRequest} onOpenChange={(open) => !open && setViewingRequest(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {viewingRequest?.status === 'approved' ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            Registration Details
          </DialogTitle>
          <DialogDescription>
            Full information submitted with this registration request
          </DialogDescription>
        </DialogHeader>

        {viewingRequest && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Status</span>
              <Badge variant={viewingRequest.status === 'approved' ? 'default' : 'destructive'}>
                {viewingRequest.status}
              </Badge>
            </div>

            <div className="space-y-3 border-t pt-3">
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Full Name</p>
                  <p className="text-sm font-medium">{viewingRequest.customerName}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Phone Number</p>
                  <p className="text-sm font-medium">{viewingRequest.customerPhone}</p>
                </div>
              </div>

              {viewingRequest.customerEmail && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm font-medium">{viewingRequest.customerEmail}</p>
                  </div>
                </div>
              )}

              {viewingRequest.businessName && (
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Business Name</p>
                    <p className="text-sm font-medium">{viewingRequest.businessName}</p>
                  </div>
                </div>
              )}

              {viewingRequest.businessType && (
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Business Type</p>
                    <p className="text-sm font-medium capitalize">{
                      viewingRequest.businessType === 'retailer' ? 'Retailer (Shop / Store)' :
                      viewingRequest.businessType === 'wholesaler' ? 'Wholesaler / Distributor' :
                      viewingRequest.businessType === 'business' ? 'Business (Restaurant, Salon, etc.)' :
                      viewingRequest.businessType === 'individual' ? 'Individual / Sole Trader' :
                      viewingRequest.businessType
                    }</p>
                  </div>
                </div>
              )}

              {viewingRequest.requestMessage && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Their Message</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewingRequest.requestMessage}</p>
                  </div>
                </div>
              )}
              {viewingRequest.productsInterested && (
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">📦</span>
                  <div>
                    <p className="text-xs text-gray-500">Products Interested In</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewingRequest.productsInterested}</p>
                  </div>
                </div>
              )}
              {viewingRequest.orderFrequency && (
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">🔁</span>
                  <div>
                    <p className="text-xs text-gray-500">Order Frequency</p>
                    <p className="text-sm text-gray-700">{viewingRequest.orderFrequency}</p>
                  </div>
                </div>
              )}
            </div>

            {viewingRequest.responseMessage && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-gray-500">Your Response</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewingRequest.responseMessage}</p>
              </div>
            )}

            <div className="text-xs text-gray-400 border-t pt-2">
              Requested {format(new Date(viewingRequest.requestedAt), 'MMM d, yyyy')}
              {viewingRequest.respondedAt && ` • Responded ${format(new Date(viewingRequest.respondedAt), 'MMM d, yyyy')}`}
            </div>
          </div>
        )}

        <DialogFooter>
          {viewingRequest?.status === 'rejected' && (
            <Button
              variant="outline"
              className="text-green-600 border-green-300 hover:bg-green-50"
              disabled={respondToRequestMutation.isPending}
              onClick={() => {
                respondToRequestMutation.mutate({ requestId: viewingRequest!.id, action: 'approve' });
                setViewingRequest(null);
              }}
            >
              Re-approve
            </Button>
          )}
          {viewingRequest?.status === 'approved' && (
            <Button
              variant="outline"
              className="text-red-600 border-red-300 hover:bg-red-50"
              disabled={respondToRequestMutation.isPending}
              onClick={() => {
                respondToRequestMutation.mutate({ requestId: viewingRequest!.id, action: 'reject' });
                setViewingRequest(null);
              }}
            >
              Revoke access
            </Button>
          )}
          <Button variant="ghost" onClick={() => setViewingRequest(null)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}