import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Users, 
  Plus, 
  MessageSquare, 
  UserPlus,
  Phone,
  Edit,
  Trash2
} from "lucide-react";

const customerGroupFormSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

const addMemberFormSchema = z.object({
  phoneNumber: z.string().min(10, "Valid phone number is required"),
  name: z.string().min(1, "Customer name is required"),
});

type CustomerGroupFormData = z.infer<typeof customerGroupFormSchema>;
type AddMemberFormData = z.infer<typeof addMemberFormSchema>;

interface CustomerGroup {
  id: number;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt: string;
  whatsappGroupId?: string;
}

export default function CustomerGroups() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CustomerGroup | null>(null);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);

  const { data: customerGroups, isLoading } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  const createGroupForm = useForm<CustomerGroupFormData>({
    resolver: zodResolver(customerGroupFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const addMemberForm = useForm<AddMemberFormData>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: {
      phoneNumber: "",
      name: "",
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: CustomerGroupFormData) => {
      const response = await apiRequest("POST", "/api/customer-groups", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      toast({
        title: "Success",
        description: "Customer group created successfully",
      });
      setIsCreateDialogOpen(false);
      createGroupForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer group",
        variant: "destructive",
      });
    },
  });

  const createWhatsAppGroupMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const response = await apiRequest("POST", `/api/customer-groups/${groupId}/whatsapp-group`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      toast({
        title: "Success",
        description: `WhatsApp group created: ${data.groupName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create WhatsApp group",
        variant: "destructive",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: AddMemberFormData & { groupId: number }) => {
      const response = await apiRequest("POST", `/api/customer-groups/${data.groupId}/members`, {
        phoneNumber: data.phoneNumber,
        name: data.name,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      toast({
        title: "Success",
        description: "Customer added to group successfully",
      });
      setIsAddMemberDialogOpen(false);
      addMemberForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer to group",
        variant: "destructive",
      });
    },
  });

  const onCreateGroup = (data: CustomerGroupFormData) => {
    createGroupMutation.mutate(data);
  };

  const onAddMember = (data: AddMemberFormData) => {
    if (!selectedGroup) return;
    addMemberMutation.mutate({ ...data, groupId: selectedGroup.id });
  };

  const handleCreateWhatsAppGroup = (groupId: number) => {
    createWhatsAppGroupMutation.mutate(groupId);
  };

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Customer Groups</h1>
                <p className="text-gray-600">Manage your customer groups and WhatsApp connections</p>
              </div>
              
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Group
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Customer Group</DialogTitle>
                  </DialogHeader>
                  <Form {...createGroupForm}>
                    <form onSubmit={createGroupForm.handleSubmit(onCreateGroup)} className="space-y-4">
                      <FormField
                        control={createGroupForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Group Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter group name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createGroupForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Enter group description" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="flex justify-end space-x-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setIsCreateDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createGroupMutation.isPending}
                        >
                          {createGroupMutation.isPending ? "Creating..." : "Create Group"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Customer Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading ? (
                // Loading skeletons
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded"></div>
                        <div className="h-8 bg-gray-200 rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : customerGroups?.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No customer groups yet</h3>
                  <p className="text-gray-600 mb-4">Create your first customer group to start organizing your customers</p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Group
                  </Button>
                </div>
              ) : (
                customerGroups?.map((group: CustomerGroup) => (
                  <Card key={group.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="truncate">{group.name}</span>
                        <Badge variant="secondary">
                          {group.memberCount || 0} members
                        </Badge>
                      </CardTitle>
                      {group.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">{group.description}</p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                          <Users className="h-4 w-4" />
                          <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
                        </div>
                        
                        {group.whatsappGroupId ? (
                          <div className="flex items-center space-x-2 text-sm text-green-600">
                            <MessageSquare className="h-4 w-4" />
                            <span>WhatsApp group connected</span>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => handleCreateWhatsAppGroup(group.id)}
                            disabled={createWhatsAppGroupMutation.isPending}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Create WhatsApp Group
                          </Button>
                        )}
                        
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setSelectedGroup(group);
                              setIsAddMemberDialogOpen(true);
                            }}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            Add Member
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Manage
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer to {selectedGroup?.name}</DialogTitle>
          </DialogHeader>
          <Form {...addMemberForm}>
            <form onSubmit={addMemberForm.handleSubmit(onAddMember)} className="space-y-4">
              <FormField
                control={addMemberForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter customer name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={addMemberForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., +44 7123 456789" 
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddMemberDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={addMemberMutation.isPending}
                >
                  {addMemberMutation.isPending ? "Adding..." : "Add Customer"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}