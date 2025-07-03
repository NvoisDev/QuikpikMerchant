import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  Trash2,
  Upload
} from "lucide-react";

const customerGroupFormSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

const addMemberFormSchema = z.object({
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
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
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Fetch group members when manage dialog opens
  const { data: groupMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ["/api/customer-groups", selectedGroup?.id, "members", searchTerm],
    queryFn: async () => {
      if (!selectedGroup?.id) return [];
      const searchParams = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const response = await fetch(`/api/customer-groups/${selectedGroup.id}/members${searchParams}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch group members");
      return response.json();
    },
    enabled: isManageDialogOpen && !!selectedGroup?.id,
  });

  const { data: customerGroups = [], isLoading } = useQuery<CustomerGroup[]>({
    queryKey: ["/api/customer-groups"],
    queryFn: async () => {
      const response = await fetch("/api/customer-groups", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch customer groups");
      return response.json();
    },
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
      // First check if phone number already exists in this group
      const existingMembers = await fetch(`/api/customer-groups/${data.groupId}/members`, {
        credentials: "include",
      }).then(res => res.json());
      
      const duplicatePhone = existingMembers.find((member: any) => 
        member.phoneNumber === data.phoneNumber
      );
      
      if (duplicatePhone) {
        throw new Error(`Phone number ${data.phoneNumber} is already in this group`);
      }
      
      const response = await apiRequest("POST", `/api/customer-groups/${data.groupId}/members`, {
        phoneNumber: data.phoneNumber,
        name: data.name,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups", selectedGroup?.id, "members"] });
      toast({
        title: "Success",
        description: "Customer added to group successfully",
      });
      setIsAddMemberDialogOpen(false);
      addMemberForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Duplicate Phone Number",
        description: error.message || "Failed to add customer to group",
        variant: "destructive",
      });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async ({ groupId, customerId }: { groupId: number; customerId: string }) => {
      const response = await apiRequest("DELETE", `/api/customer-groups/${groupId}/members/${customerId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups", selectedGroup?.id, "members"] });
      toast({
        title: "Success",
        description: "Customer removed from group successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove customer from group",
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

  const onDeleteMember = (customerId: string) => {
    if (selectedGroup) {
      deleteMemberMutation.mutate({ groupId: selectedGroup.id, customerId });
    }
  };

  const handleCreateWhatsAppGroup = (groupId: number) => {
    createWhatsAppGroupMutation.mutate(groupId);
  };

  const handleSelectFromContacts = async () => {
    try {
      // Check if Contact Picker API is supported
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        const contacts = await (navigator as any).contacts.select(props, opts);
        
        if (contacts && contacts.length > 0) {
          const contact = contacts[0];
          if (contact.tel && contact.tel.length > 0) {
            addMemberForm.setValue('phoneNumber', contact.tel[0]);
            addMemberForm.setValue('name', contact.name || '');
          }
        }
      } else {
        // Fallback: Show instructions or alternative method
        toast({
          title: "Contact Access Not Available",
          description: "Your browser doesn't support contact access. Please manually enter the phone number.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error accessing contacts:', error);
      toast({
        title: "Error",
        description: "Unable to access contacts. Please manually enter the phone number.",
        variant: "destructive",
      });
    }
  };

  const handleImportContacts = () => {
    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.xlsx,.xls';
    fileInput.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          // Parse CSV content (simple implementation)
          const lines = text.split('\n');
          const contacts = [];
          
          for (let i = 1; i < lines.length; i++) { // Skip header
            const columns = lines[i].split(',');
            if (columns.length >= 2) {
              const name = columns[0]?.trim();
              const phone = columns[1]?.trim();
              if (name && phone) {
                contacts.push({ name, phone });
              }
            }
          }
          
          if (contacts.length > 0) {
            // For now, just fill the form with the first contact
            // In a full implementation, you'd show a list to choose from
            addMemberForm.setValue('name', contacts[0].name);
            addMemberForm.setValue('phoneNumber', contacts[0].phone);
            
            toast({
              title: "Contacts Imported",
              description: `Found ${contacts.length} contacts. First contact has been loaded.`,
            });
          }
        };
        reader.readAsText(file);
      }
    };
    fileInput.click();
  };

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
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
              <DialogDescription>
                Create a new customer group to organize your customers and send them targeted broadcasts.
              </DialogDescription>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
        ) : customerGroups.length === 0 ? (
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
          customerGroups.map((group: CustomerGroup) => (
            <Card key={group.id} className="hover:shadow-lg transition-all duration-200 border-gray-200 h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="truncate text-lg font-semibold">{group.name}</span>
                  <button
                    className="h-7 px-3 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-200 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedGroup(group);
                      setIsManageDialogOpen(true);
                    }}
                  >
                    {group.memberCount || 0} members
                  </button>
                </CardTitle>
                {group.description && (
                  <p className="text-sm text-gray-600 line-clamp-2 mt-1">{group.description}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <Users className="h-4 w-4" />
                    <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
                  </div>
                  
                  {group.whatsappGroupId ? (
                    <div className="flex items-center space-x-2 text-sm text-green-600 bg-green-50 p-2 rounded-lg">
                      <MessageSquare className="h-4 w-4" />
                      <span>WhatsApp group connected</span>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-green-200 hover:bg-green-50 hover:border-green-300"
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
                      onClick={() => {
                        setSelectedGroup(group);
                        setIsManageDialogOpen(true);
                      }}
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
      
      {/* Add Member Dialog */}
      <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Add a new customer to this group by providing their phone number and name. They will be able to receive broadcasts and updates.
            </DialogDescription>
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
              
              <div className="flex space-x-2 mb-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSelectFromContacts()}
                  className="flex-1"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Select from Contacts
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleImportContacts()}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </Button>
              </div>

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

      {/* Manage Group Dialog */}
      <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              View and manage group members. Search by name or phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search Box */}
            <div className="relative">
              <Input
                placeholder="Search members by name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-4"
              />
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Members</span>
                <Badge variant="secondary">{selectedGroup?.memberCount || 0}</Badge>
              </div>
              
              {membersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center space-x-3 animate-pulse">
                      <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                      <div className="flex-1 space-y-1">
                        <div className="h-3 bg-gray-300 rounded w-3/4"></div>
                        <div className="h-2 bg-gray-300 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : groupMembers.length === 0 ? (
                <p className="text-sm text-gray-600">
                  {searchTerm ? "No members found matching your search." : "No members yet. Add customers to start building your group."}
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {groupMembers.map((member: any) => (
                    <div key={member.id} className="flex items-start space-x-3 p-3 bg-white rounded border">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-blue-600">
                          {member.firstName?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {member.firstName} {member.lastName || ''}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center mt-1">
                          <Phone className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">{member.phoneNumber}</span>
                        </div>
                        {member.email && (
                          <div className="text-xs text-gray-500 truncate mt-1">
                            {member.email}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteMember(member.id)}
                        disabled={deleteMemberMutation.isPending}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">WhatsApp Integration</span>
                {selectedGroup?.whatsappGroupId ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">Connected</Badge>
                ) : (
                  <Badge variant="outline">Not connected</Badge>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {selectedGroup?.whatsappGroupId
                  ? "This group is connected to WhatsApp for easy broadcasting."
                  : "Connect to WhatsApp to send broadcasts directly to group members."
                }
              </p>
            </div>

            <div className="flex space-x-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsManageDialogOpen(false);
                  setIsAddMemberDialogOpen(true);
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
              
              {!selectedGroup?.whatsappGroupId && (
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (selectedGroup) {
                      handleCreateWhatsAppGroup(selectedGroup.id);
                      setIsManageDialogOpen(false);
                    }
                  }}
                  disabled={createWhatsAppGroupMutation.isPending}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Connect WhatsApp
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}