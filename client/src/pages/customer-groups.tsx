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
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";

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

const bulkAddFormSchema = z.object({
  contacts: z.string().min(1, "Please enter contact information"),
});

const editMemberFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  email: z.union([
    z.string().email("Please enter a valid email address"),
    z.literal("")
  ]).optional(),
  businessName: z.string().optional(),
});

type CustomerGroupFormData = z.infer<typeof customerGroupFormSchema>;
type AddMemberFormData = z.infer<typeof addMemberFormSchema>;
type BulkAddFormData = z.infer<typeof bulkAddFormSchema>;
type EditMemberFormData = z.infer<typeof editMemberFormSchema>;

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
  const [isBulkAddDialogOpen, setIsBulkAddDialogOpen] = useState(false);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditMemberDialogOpen, setIsEditMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"customer_group_limit" | "general">("general");
  
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

  // Fetch subscription status for limit checking
  const { data: subscriptionStatus } = useQuery({
    queryKey: ["/api/subscription/status"],
    queryFn: async () => {
      const response = await fetch("/api/subscription/status", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch subscription status");
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

  const bulkAddForm = useForm<BulkAddFormData>({
    resolver: zodResolver(bulkAddFormSchema),
    defaultValues: {
      contacts: "",
    },
  });

  const editGroupForm = useForm<CustomerGroupFormData>({
    resolver: zodResolver(customerGroupFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const editMemberForm = useForm<EditMemberFormData>({
    resolver: zodResolver(editMemberFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phoneNumber: "",
      email: "",
      businessName: "",
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

  const updateGroupMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; description?: string }) => {
      const response = await apiRequest("PUT", `/api/customer-groups/${data.id}`, {
        name: data.name,
        description: data.description,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      toast({
        title: "Success",
        description: "Customer group updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer group",
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

  const editMemberMutation = useMutation({
    mutationFn: async ({ groupId, customerId, firstName, lastName, phoneNumber, email, businessName }: { groupId: number; customerId: string; firstName: string; lastName: string; phoneNumber: string; email?: string; businessName?: string }) => {
      const response = await apiRequest("PATCH", `/api/customer-groups/${groupId}/members/${customerId}`, {
        firstName,
        lastName,
        phoneNumber,
        email,
        businessName
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups", selectedGroup?.id, "members"] });
      toast({
        title: "Success",
        description: "Customer information updated successfully",
      });
      setIsEditMemberDialogOpen(false);
      setEditingMember(null);
      editMemberForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer information",
        variant: "destructive",
      });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const response = await apiRequest("DELETE", `/api/customer-groups/${groupId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-groups"] });
      toast({
        title: "Success",
        description: "Customer group deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer group",
        variant: "destructive",
      });
    },
  });

  // Check if user can create more customer groups
  const canCreateGroup = () => {
    if (!subscriptionStatus) return true; // Allow if status not loaded yet
    
    const currentCount = customerGroups.length;
    const limits = {
      free: 2,
      standard: 5,
      premium: Infinity,
      team_member: Infinity // Team members inherit parent company limits
    };
    
    const limit = limits[subscriptionStatus.subscriptionTier as keyof typeof limits] || 2;
    return currentCount < limit;
  };

  const handleCreateGroupClick = () => {
    if (!canCreateGroup()) {
      setUpgradeReason("customer_group_limit");
      setShowUpgradeModal(true);
      return;
    }
    setIsCreateDialogOpen(true);
  };

  const onCreateGroup = (data: CustomerGroupFormData) => {
    createGroupMutation.mutate(data);
  };

  const onEditGroup = (data: CustomerGroupFormData) => {
    if (!selectedGroup) return;
    updateGroupMutation.mutate({
      id: selectedGroup.id,
      name: data.name,
      description: data.description,
    });
    setIsEditDialogOpen(false);
    editGroupForm.reset();
  };

  const onAddMember = (data: AddMemberFormData) => {
    if (!selectedGroup) return;
    addMemberMutation.mutate({ ...data, groupId: selectedGroup.id });
  };

  const onBulkAddMembers = (data: BulkAddFormData) => {
    if (!selectedGroup) return;
    
    // Parse multiple contacts from the input
    const contacts = parseMultipleContacts(data.contacts);
    
    if (contacts.length === 0) {
      toast({
        title: "No Valid Contacts Found",
        description: "Please check the format and try again.",
        variant: "destructive",
      });
      return;
    }

    // Add each contact individually (could be optimized with bulk API)
    contacts.forEach((contact, index) => {
      setTimeout(() => {
        addMemberMutation.mutate({ 
          ...contact, 
          groupId: selectedGroup.id 
        });
      }, index * 100); // Small delay to avoid overwhelming the server
    });

    toast({
      title: "Adding Contacts",
      description: `Adding ${contacts.length} contacts to the group...`,
    });

    setIsBulkAddDialogOpen(false);
    bulkAddForm.reset();
  };

  const parseMultipleContacts = (input: string): AddMemberFormData[] => {
    const contacts: AddMemberFormData[] = [];
    const lines = input.trim().split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Try different formats:
      // 1. "Name, Phone" or "Name: Phone"
      // 2. "Phone - Name" or "Phone, Name"
      // 3. Just phone numbers (will use placeholder names)
      
      let name = '', phoneNumber = '';
      
      if (trimmedLine.includes(',')) {
        const parts = trimmedLine.split(',').map(p => p.trim());
        // Check which part looks like a phone number
        const phoneIndex = parts.findIndex(p => /[\d\+\-\s\(\)]{7,}/.test(p));
        if (phoneIndex !== -1) {
          phoneNumber = parts[phoneIndex];
          name = parts[1 - phoneIndex] || `Contact ${contacts.length + 1}`;
        }
      } else if (trimmedLine.includes(':')) {
        const [namePart, phonePart] = trimmedLine.split(':').map(p => p.trim());
        if (/[\d\+\-\s\(\)]{7,}/.test(phonePart)) {
          name = namePart;
          phoneNumber = phonePart;
        } else if (/[\d\+\-\s\(\)]{7,}/.test(namePart)) {
          name = phonePart || `Contact ${contacts.length + 1}`;
          phoneNumber = namePart;
        }
      } else if (trimmedLine.includes('-')) {
        const parts = trimmedLine.split('-').map(p => p.trim());
        const phoneIndex = parts.findIndex(p => /[\d\+\-\s\(\)]{7,}/.test(p));
        if (phoneIndex !== -1) {
          phoneNumber = parts[phoneIndex];
          name = parts[1 - phoneIndex] || `Contact ${contacts.length + 1}`;
        }
      } else {
        // Check if the line is just a phone number
        if (/[\d\+\-\s\(\)]{7,}/.test(trimmedLine)) {
          phoneNumber = trimmedLine;
          name = `Contact ${contacts.length + 1}`;
        } else {
          // Skip lines that don't contain recognizable phone numbers
          continue;
        }
      }
      
      // Clean phone number
      if (phoneNumber) {
        phoneNumber = phoneNumber.replace(/[^\+\d]/g, '');
        if (phoneNumber.length >= 7) {
          // Add UK country code if missing
          if (!phoneNumber.startsWith('+') && phoneNumber.length <= 11) {
            if (phoneNumber.startsWith('0')) {
              phoneNumber = '+44' + phoneNumber.substring(1);
            } else if (phoneNumber.length === 10) {
              phoneNumber = '+44' + phoneNumber;
            }
          }
          
          contacts.push({ name, phoneNumber });
        }
      }
    }
    
    return contacts;
  };

  const handleBulkImportContacts = () => {
    // Create a file input element for bulk import
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.txt,.vcf,.xlsx,.xls';
    fileInput.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const contacts: { name: string; phone: string }[] = [];
          
          if (file.name.endsWith('.vcf')) {
            // Parse vCard format
            const vCards = text.split('BEGIN:VCARD');
            for (const vCard of vCards) {
              if (vCard.includes('FN:') && vCard.includes('TEL:')) {
                const nameMatch = vCard.match(/FN:(.+)/);
                const phoneMatches = vCard.match(/TEL[^:]*:(.+)/g);
                if (nameMatch && phoneMatches) {
                  const name = nameMatch[1].trim();
                  for (const phoneMatch of phoneMatches) {
                    const phone = phoneMatch.split(':')[1]?.replace(/[^\+\d]/g, '');
                    if (phone && phone.length >= 7) {
                      contacts.push({ name, phone });
                      break;
                    }
                  }
                }
              }
            }
          } else {
            // Parse CSV/TXT format
            const lines = text.split('\n');
            let nameIndex = 0, phoneIndex = 1;
            let startIndex = 0;
            
            if (lines[0]) {
              const header = lines[0].toLowerCase();
              if (header.includes('name') || header.includes('phone') || header.includes('mobile')) {
                startIndex = 1;
                const columns = header.split(',').map((col, idx) => ({ col: col.trim(), idx }));
                
                const nameCol = columns.find(c => 
                  c.col.includes('name') || c.col.includes('first') || c.col.includes('last')
                );
                if (nameCol) nameIndex = nameCol.idx;
                
                const phoneCol = columns.find(c => 
                  c.col.includes('phone') || c.col.includes('mobile') || c.col.includes('cell') || c.col.includes('tel')
                );
                if (phoneCol) phoneIndex = phoneCol.idx;
              }
            }
            
            for (let i = startIndex; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              let name = '', phone = '';
              
              if (line.includes(',')) {
                const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
                name = columns[nameIndex] || '';
                phone = columns[phoneIndex] || '';
                
                if (!phone) {
                  for (let j = 0; j < columns.length; j++) {
                    const potentialPhone = columns[j]?.replace(/[^\+\d]/g, '');
                    if (potentialPhone && potentialPhone.length >= 7) {
                      phone = potentialPhone;
                      break;
                    }
                  }
                }
              } else if (line.includes('\t')) {
                const columns = line.split('\t').map(col => col.trim());
                name = columns[nameIndex] || '';
                phone = columns[phoneIndex] || '';
              } else {
                const phoneRegex = /(\+?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9})/;
                const phoneMatch = line.match(phoneRegex);
                if (phoneMatch) {
                  phone = phoneMatch[1].replace(/[^\+\d]/g, '');
                  name = line.replace(phoneMatch[0], '').trim();
                }
              }
              
              if (phone) {
                phone = phone.replace(/[^\+\d]/g, '');
                if (phone.length >= 7) {
                  if (!phone.startsWith('+') && phone.length <= 11) {
                    if (phone.startsWith('0')) {
                      phone = '+44' + phone.substring(1);
                    } else if (phone.length === 10) {
                      phone = '+44' + phone;
                    }
                  }
                  contacts.push({ name: name || 'Unknown Contact', phone });
                }
              }
            }
          }
          
          if (contacts.length > 0) {
            // Format contacts for the textarea
            const contactsText = contacts.map(contact => `${contact.name}, ${contact.phone}`).join('\n');
            bulkAddForm.setValue('contacts', contactsText);
            
            toast({
              title: "Contacts Imported",
              description: `Imported ${contacts.length} contacts. Review and add them to the group.`,
            });
          } else {
            toast({
              title: "No Valid Contacts Found",
              description: "Export your contacts as CSV from your phone's address book, or use vCard (.vcf) format.",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
    };
    fileInput.click();
  };

  const onDeleteMember = (customerId: string) => {
    if (selectedGroup) {
      deleteMemberMutation.mutate({ groupId: selectedGroup.id, customerId });
    }
  };

  const onEditMember = (member: any) => {
    setEditingMember(member);
    // Extract first and last names from the member data
    const firstName = member.firstName || member.name?.split(' ')[0] || '';
    const lastName = member.lastName || member.name?.split(' ').slice(1).join(' ') || '';
    
    editMemberForm.reset({
      firstName: firstName,
      lastName: lastName,
      phoneNumber: member.phoneNumber || member.phone || "",
      email: member.email || "",
      businessName: member.businessName || "",
    });
    setIsEditMemberDialogOpen(true);
  };

  const onSaveEditMember = (data: EditMemberFormData) => {
    if (!selectedGroup || !editingMember) return;
    editMemberMutation.mutate({
      groupId: selectedGroup.id,
      customerId: editingMember.id,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      email: data.email,
      businessName: data.businessName,
    });
  };

  const handleCreateWhatsAppGroup = (groupId: number) => {
    createWhatsAppGroupMutation.mutate(groupId);
  };

  const handleSelectFromContacts = async () => {
    try {
      // Check if Contact Picker API is supported (modern mobile browsers)
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        const contacts = await (navigator as any).contacts.select(props, opts);
        
        if (contacts && contacts.length > 0) {
          // Show contact selection dialog if multiple contacts
          if (contacts.length === 1) {
            const contact = contacts[0];
            if (contact.tel && contact.tel.length > 0) {
              const phoneNumber = contact.tel[0].replace(/[^\+\d]/g, '');
              addMemberForm.setValue('phoneNumber', phoneNumber);
              addMemberForm.setValue('name', contact.name ? contact.name.join(' ') : '');
              
              toast({
                title: "Contact Added",
                description: `Added ${contact.name ? contact.name.join(' ') : 'contact'} from your address book.`,
              });
            }
          } else {
            // Multiple contacts - for now, use first one (could be enhanced with selection dialog)
            const contact = contacts[0];
            if (contact.tel && contact.tel.length > 0) {
              const phoneNumber = contact.tel[0].replace(/[^\+\d]/g, '');
              addMemberForm.setValue('phoneNumber', phoneNumber);
              addMemberForm.setValue('name', contact.name ? contact.name.join(' ') : '');
              
              toast({
                title: "Contacts Available",
                description: `Found ${contacts.length} contacts. Added first contact. Tap again for more.`,
              });
            }
          }
        } else {
          toast({
            title: "No Contacts Selected",
            description: "Please select a contact from your address book or enter manually.",
          });
        }
      } else {
        // Fallback for browsers without Contact Picker API
        toast({
          title: "Address Book Access",
          description: "To access your address book:\n• Use Chrome or Safari on mobile\n• Or import contacts via CSV file\n• Or copy/paste numbers manually",
          variant: "default",
        });
      }
    } catch (error: any) {
      console.error('Error accessing address book:', error);
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Permission Denied",
          description: "Please allow access to your contacts in browser settings, or use manual entry.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Contact Access Unavailable",
          description: "Your browser doesn't support contact access. Use manual entry or CSV import.",
          variant: "destructive",
        });
      }
    }
  };

  const handleImportContacts = () => {
    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.txt,.vcf,.xlsx,.xls';
    fileInput.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const contacts: { name: string; phone: string }[] = [];
          
          if (file.name.endsWith('.vcf')) {
            // Parse vCard format (standard address book export)
            const vCards = text.split('BEGIN:VCARD');
            for (const vCard of vCards) {
              if (vCard.includes('FN:') && vCard.includes('TEL:')) {
                const nameMatch = vCard.match(/FN:(.+)/);
                const phoneMatches = vCard.match(/TEL[^:]*:(.+)/g);
                if (nameMatch && phoneMatches) {
                  const name = nameMatch[1].trim();
                  // Get the first valid phone number
                  for (const phoneMatch of phoneMatches) {
                    const phone = phoneMatch.split(':')[1]?.replace(/[^\+\d]/g, '');
                    if (phone && phone.length >= 7) {
                      contacts.push({ name, phone });
                      break; // Only take first valid phone number per contact
                    }
                  }
                }
              }
            }
          } else {
            // Parse CSV/TXT format (common address book exports)
            const lines = text.split('\n');
            let nameIndex = 0, phoneIndex = 1;
            let startIndex = 0;
            
            // Detect header row and column positions
            if (lines[0]) {
              const header = lines[0].toLowerCase();
              if (header.includes('name') || header.includes('phone') || header.includes('mobile')) {
                startIndex = 1;
                const columns = header.split(',').map((col, idx) => ({ col: col.trim(), idx }));
                
                // Find name column
                const nameCol = columns.find(c => 
                  c.col.includes('name') || c.col.includes('first') || c.col.includes('last')
                );
                if (nameCol) nameIndex = nameCol.idx;
                
                // Find phone column
                const phoneCol = columns.find(c => 
                  c.col.includes('phone') || c.col.includes('mobile') || c.col.includes('cell') || c.col.includes('tel')
                );
                if (phoneCol) phoneIndex = phoneCol.idx;
              }
            }
            
            for (let i = startIndex; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              let name = '', phone = '';
              
              if (line.includes(',')) {
                // CSV format - most common for address book exports
                const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
                name = columns[nameIndex] || '';
                phone = columns[phoneIndex] || '';
                
                // If no phone in expected column, search other columns
                if (!phone) {
                  for (let j = 0; j < columns.length; j++) {
                    const potentialPhone = columns[j]?.replace(/[^\+\d]/g, '');
                    if (potentialPhone && potentialPhone.length >= 7) {
                      phone = potentialPhone;
                      break;
                    }
                  }
                }
              } else if (line.includes('\t')) {
                // Tab separated
                const columns = line.split('\t').map(col => col.trim());
                name = columns[nameIndex] || '';
                phone = columns[phoneIndex] || '';
              } else {
                // Single line with phone number
                const phoneRegex = /(\+?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9})/;
                const phoneMatch = line.match(phoneRegex);
                if (phoneMatch) {
                  phone = phoneMatch[1].replace(/[^\+\d]/g, '');
                  name = line.replace(phoneMatch[0], '').trim();
                }
              }
              
              // Clean and validate phone number
              if (phone) {
                phone = phone.replace(/[^\+\d]/g, '');
                if (phone.length >= 7) { // Valid phone length
                  // Add country code if missing (assuming UK for now)
                  if (!phone.startsWith('+') && phone.length <= 11) {
                    if (phone.startsWith('0')) {
                      phone = '+44' + phone.substring(1);
                    } else if (phone.length === 10) {
                      phone = '+44' + phone;
                    }
                  }
                  contacts.push({ name: name || 'Unknown Contact', phone });
                }
              }
            }
          }
          
          if (contacts.length > 0) {
            // Fill form with first contact
            addMemberForm.setValue('name', contacts[0].name);
            addMemberForm.setValue('phoneNumber', contacts[0].phone);
            
            toast({
              title: "Address Book Imported",
              description: `Found ${contacts.length} contacts from your address book. First contact loaded.`,
            });
            
            // Log additional contacts for debugging
            if (contacts.length > 1) {
              console.log('Additional contacts available:', contacts.slice(1));
            }
          } else {
            toast({
              title: "No Valid Contacts Found",
              description: "Export your contacts as CSV from your phone's address book, or use vCard (.vcf) format.",
              variant: "destructive",
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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900">Customer Groups</h1>
            <ContextualHelpBubble
              topic="customer groups"
              title="Managing Customer Groups"
              steps={helpContent.customerGroups.steps}
              position="right"
            />
          </div>
          <p className="text-gray-600">Manage your customer groups and WhatsApp connections</p>
        </div>
        
        <Button onClick={handleCreateGroupClick}>
          <Plus className="h-4 w-4 mr-2" />
          Create Group
        </Button>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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

        {/* Edit Customer Group Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Customer Group</DialogTitle>
              <DialogDescription>
                Update the name and description of your customer group.
              </DialogDescription>
            </DialogHeader>
            <Form {...editGroupForm}>
              <form onSubmit={editGroupForm.handleSubmit(onEditGroup)} className="space-y-4">
                <FormField
                  control={editGroupForm.control}
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
                  control={editGroupForm.control}
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
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateGroupMutation.isPending}
                  >
                    {updateGroupMutation.isPending ? "Updating..." : "Update Group"}
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
            <Button onClick={handleCreateGroupClick}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Group
            </Button>
          </div>
        ) : (
          customerGroups.map((group: CustomerGroup) => (
            <Card key={group.id} className="hover:shadow-lg transition-all duration-200 border-gray-200 h-fit">
              <CardHeader className="pb-3">
                <div className="space-y-3">
                  <CardTitle className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="truncate text-lg font-semibold">{group.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                          onClick={() => {
                            setSelectedGroup(group);
                            editGroupForm.setValue('name', group.name);
                            editGroupForm.setValue('description', group.description || '');
                            setIsEditDialogOpen(true);
                          }}
                          title="Edit group name"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          className="flex-shrink-0 p-1 text-red-400 hover:text-red-600 rounded transition-colors"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete "${group.name}"? This action cannot be undone and will remove all members from the group.`)) {
                              deleteGroupMutation.mutate(group.id);
                            }
                          }}
                          title="Delete group"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardTitle>
                  
                  <button
                    className="flex-shrink-0 h-7 px-3 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-200 transition-colors cursor-pointer w-fit"
                    onClick={() => {
                      setSelectedGroup(group);
                      setIsManageDialogOpen(true);
                    }}
                  >
                    {group.memberCount || 0} members
                  </button>
                  
                  {group.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{group.description}</p>
                  )}
                </div>
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
                  
                  <div className="flex flex-col space-y-2">
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
                        Add One
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedGroup(group);
                          setIsBulkAddDialogOpen(true);
                        }}
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Bulk Add
                      </Button>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
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
      
      {/* Bulk Add Members Dialog */}
      <Dialog open={isBulkAddDialogOpen} onOpenChange={setIsBulkAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Multiple Customers to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Add multiple customers at once. Enter each contact on a new line in any of these formats:
              <br />• Name, Phone Number
              <br />• Phone Number, Name  
              <br />• Name: Phone Number
              <br />• Just phone numbers (auto-named)
            </DialogDescription>
          </DialogHeader>
          <Form {...bulkAddForm}>
            <form onSubmit={bulkAddForm.handleSubmit(onBulkAddMembers)} className="space-y-4">
              <div className="space-y-3">
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSelectFromContacts()}
                    className="flex-1"
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Phone Contacts
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleBulkImportContacts()}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import File
                  </Button>
                </div>
                
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  Import contacts from your address book or type multiple contacts below.
                </div>
              </div>

              <FormField
                control={bulkAddForm.control}
                name="contacts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contacts (one per line)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={`John Smith, +44 7123 456789
Jane Doe: +44 7987 654321
+44 7555 123456
Mike Johnson, 07444 555666`}
                        className="min-h-[200px] font-mono text-sm"
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
                  onClick={() => setIsBulkAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={addMemberMutation.isPending}
                >
                  {addMemberMutation.isPending ? "Adding..." : "Add All Contacts"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
              
              <div className="space-y-3 mb-4">
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSelectFromContacts()}
                    className="flex-1"
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Phone Contacts
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleImportContacts()}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import File
                  </Button>
                </div>
                
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  <strong>Address Book Access:</strong> "Phone Contacts" button accesses your device's address book directly. For bulk import, export contacts as CSV from your phone or use vCard (.vcf) files.
                </div>
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
                      <div className="flex space-x-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditMember(member)}
                          disabled={editMemberMutation.isPending}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteMember(member.id)}
                          disabled={deleteMemberMutation.isPending}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      {/* Edit Member Dialog */}
      <Dialog open={isEditMemberDialogOpen} onOpenChange={setIsEditMemberDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer Information</DialogTitle>
            <DialogDescription>
              Update customer details including business information. Changes will be reflected across all groups.
            </DialogDescription>
          </DialogHeader>
          <Form {...editMemberForm}>
            <form onSubmit={editMemberForm.handleSubmit(onSaveEditMember)} className="space-y-4">
              <FormField
                control={editMemberForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter first name" 
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editMemberForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter last name" 
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editMemberForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="customer@example.com" 
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editMemberForm.control}
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
              
              <FormField
                control={editMemberForm.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter business name" 
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
                  onClick={() => {
                    setIsEditMemberDialogOpen(false);
                    setEditingMember(null);
                    editMemberForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={editMemberMutation.isPending}
                >
                  {editMemberMutation.isPending ? "Updating..." : "Update Customer Information"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Subscription Upgrade Modal */}
      <SubscriptionUpgradeModal 
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        reason={upgradeReason}
        currentPlan={subscriptionStatus?.subscriptionTier || "free"}
      />
    </div>
  );
}