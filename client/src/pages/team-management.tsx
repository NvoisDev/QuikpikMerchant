import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";
import TabPermissionsManager from "@/components/TabPermissionsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  UserPlus, 
  Users, 
  Mail, 
  Shield, 
  ShieldCheck, 
  Trash2, 
  Lock,
  AlertCircle,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Settings,
  Edit
} from "lucide-react";
import type { TeamMember } from "@shared/schema";

const teamMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  role: z.enum(["admin", "member"]),
  permissions: z.array(z.string()).default(["products", "orders", "customers"]),
});

type TeamMemberFormData = z.infer<typeof teamMemberSchema>;

function getSubscriptionLimit(tier: string): number {
  switch (tier) {
    case 'free': return 0;
    case 'standard': return 2;
    case 'premium': return 5;
    default: return 0;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'active':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'suspended':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'active':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'suspended':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function TeamManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscription } = useSubscription();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedMemberForRoleEdit, setSelectedMemberForRoleEdit] = useState<TeamMember | null>(null);
  const [isRoleEditOpen, setIsRoleEditOpen] = useState(false);

  const form = useForm<TeamMemberFormData>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "member",
      permissions: ["products", "orders", "customers"],
    },
  });

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ["/api/team-members"],
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async (data: TeamMemberFormData) => {
      const response = await apiRequest("POST", "/api/team-members", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Team member invited",
        description: "Invitation sent successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setIsInviteDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      if (error.message.includes("subscription limit")) {
        setShowUpgradeModal(true);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to invite team member",
          variant: "destructive",
        });
      }
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      await apiRequest("DELETE", `/api/team-members/${memberId}`);
    },
    onSuccess: () => {
      toast({
        title: "Team member removed",
        description: "Team member has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove team member",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: number; role: string }) => {
      await apiRequest("PATCH", `/api/team-members/${memberId}/role`, { role });
    },
    onSuccess: () => {
      toast({
        title: "Role updated",
        description: "Team member role has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setIsRoleEditOpen(false);
      setSelectedMemberForRoleEdit(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update role",
        variant: "destructive",
      });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const response = await apiRequest("POST", `/api/team-members/${memberId}/resend-invite`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitation resent",
        description: "Invitation has been resent successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resend invitation",
        variant: "destructive",
      });
    },
  });

  const currentTier = subscription?.subscriptionTier || 'free';
  const teamLimit = getSubscriptionLimit(currentTier);
  const currentTeamCount = teamMembers?.length || 0;
  const canAddMembers = currentTeamCount < teamLimit;

  const handleInviteMember = (data: TeamMemberFormData) => {
    if (!canAddMembers) {
      setShowUpgradeModal(true);
      return;
    }
    inviteMemberMutation.mutate(data);
  };

  const handleDeleteMember = (memberId: number) => {
    if (window.confirm("Are you sure you want to remove this team member?")) {
      deleteMemberMutation.mutate(memberId);
    }
  };

  const handleResendInvite = (memberId: number) => {
    resendInviteMutation.mutate(memberId);
  };

  const handleCopyInviteLink = (member: TeamMember) => {
    const inviteLink = `${window.location.origin}/team-invitation?token=${member.id}&email=${encodeURIComponent(member.email)}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "Invitation link copied",
      description: "You can now share this link directly with the team member.",
    });
  };

  const handleEditRole = (member: TeamMember) => {
    setSelectedMemberForRoleEdit(member);
    setIsRoleEditOpen(true);
  };

  const handleUpdateRole = (role: string) => {
    if (selectedMemberForRoleEdit) {
      updateRoleMutation.mutate({ 
        memberId: selectedMemberForRoleEdit.id, 
        role 
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col items-center space-y-6">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-3 h-12 bg-gradient-to-t from-green-400 to-blue-500 rounded-full animate-bounce"
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1s'
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500 text-center">Loading team management...</p>
          
          {/* Skeleton Cards */}
          <div className="w-full space-y-4 mt-8">
            <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
          <p className="text-gray-600 mt-2">
            Manage team access and permissions for your wholesale platform
          </p>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => !canAddMembers && setShowUpgradeModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!canAddMembers && currentTier !== 'premium'}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Team Member
              {!canAddMembers && <Lock className="h-4 w-4 ml-2" />}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleInviteMember)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="team.member@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role & Permissions</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="member">
                            <div className="flex flex-col py-1">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-gray-400" />
                                <span className="font-medium">Member</span>
                              </div>
                              <span className="text-xs text-gray-500">Access only to areas you allow in Tab Permissions</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex flex-col py-1">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-blue-500" />
                                <span className="font-medium">Admin</span>
                              </div>
                              <span className="text-xs text-gray-500">Full access to all unrestricted business areas</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="bg-blue-50 p-3 rounded-lg mt-2">
                        <p className="text-xs text-blue-800">
                          <strong>Tip:</strong> Use the Tab Permissions section below to control which business areas team members can access.
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsInviteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={inviteMemberMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {inviteMemberMutation.isPending ? "Sending..." : "Send Invitation"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Limits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                Current Plan: <span className="font-semibold capitalize">{currentTier}</span>
              </p>
              <p className="text-sm text-gray-600">
                Team Members: {currentTeamCount} / {teamLimit === -1 ? "unlimited" : teamLimit}
              </p>
            </div>
            {currentTier === 'free' && (
              <Button 
                onClick={() => setShowUpgradeModal(true)}
                variant="outline"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                Upgrade to Add Team Members
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Content with Tabs */}
      <Tabs defaultValue="members" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Tab Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
            </CardHeader>
            <CardContent>
          {teamMembers?.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No team members yet</h3>
              <p className="text-gray-600 mb-4">
                {currentTier === 'free' 
                  ? "Upgrade your plan to invite team members and collaborate on your wholesale platform."
                  : "Invite team members to help manage your wholesale platform."
                }
              </p>
              {currentTier !== 'free' && (
                <Button 
                  onClick={() => setIsInviteDialogOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Your First Team Member
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {teamMembers?.map((member: TeamMember) => (
                <div 
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <span className="text-emerald-700 font-semibold">
                        {member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {member.firstName} {member.lastName}
                      </h3>
                      <p className="text-sm text-gray-600 flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(member.status)}
                      <Badge variant={getStatusBadgeVariant(member.status)}>
                        {member.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.role === 'admin' ? (
                        <ShieldCheck className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Shield className="h-4 w-4 text-gray-400" />
                      )}
                      <Badge variant={member.role === 'admin' ? 'default' : 'outline'} className={member.role === 'admin' ? 'bg-blue-500 text-white' : ''}>
                        {member.role === 'admin' ? 'Admin' : 'Member'}
                      </Badge>
                      {member.role === 'admin' && (
                        <span className="text-xs text-blue-600 font-medium">Full Access</span>
                      )}
                      {member.role === 'member' && (
                        <span className="text-xs text-gray-500">Limited Access</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {member.status === 'pending' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResendInvite(member.id)}
                            disabled={resendInviteMutation.isPending}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                          >
                            <Mail className="h-4 w-4 mr-1" />
                            {resendInviteMutation.isPending ? "Sending..." : "Resend Email"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyInviteLink(member)}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Copy Link
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditRole(member)}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit Role
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMember(member.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Tab Access Control
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TabPermissionsManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upgrade Modal */}
      <SubscriptionUpgradeModal 
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="team management"
        currentUsage={currentTeamCount}
        limit={teamLimit}
      />

      {/* Role Edit Dialog */}
      <Dialog open={isRoleEditOpen} onOpenChange={setIsRoleEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-orange-600" />
              Edit Team Member Role
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedMemberForRoleEdit && (
              <>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <span className="text-emerald-700 font-semibold">
                      {selectedMemberForRoleEdit.firstName?.charAt(0)}{selectedMemberForRoleEdit.lastName?.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selectedMemberForRoleEdit.firstName} {selectedMemberForRoleEdit.lastName}
                    </h3>
                    <p className="text-sm text-gray-600">{selectedMemberForRoleEdit.email}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Select the role for this team member:</p>
                  
                  <div className="space-y-2">
                    <Button
                      variant={selectedMemberForRoleEdit.role === 'admin' ? 'default' : 'outline'}
                      className={`w-full justify-start ${selectedMemberForRoleEdit.role === 'admin' ? 'bg-blue-500 text-white' : 'text-blue-600 hover:bg-blue-50 border-blue-200'}`}
                      onClick={() => handleUpdateRole('admin')}
                      disabled={updateRoleMutation.isPending}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      <div className="text-left">
                        <div className="font-medium">Admin</div>
                        <div className="text-xs opacity-75">Full access to all features and settings</div>
                      </div>
                    </Button>
                    
                    <Button
                      variant={selectedMemberForRoleEdit.role === 'member' ? 'default' : 'outline'}
                      className={`w-full justify-start ${selectedMemberForRoleEdit.role === 'member' ? 'bg-gray-500 text-white' : 'text-gray-600 hover:bg-gray-50 border-gray-200'}`}
                      onClick={() => handleUpdateRole('member')}
                      disabled={updateRoleMutation.isPending}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      <div className="text-left">
                        <div className="font-medium">Member</div>
                        <div className="text-xs opacity-75">Limited access based on tab permissions</div>
                      </div>
                    </Button>
                  </div>
                  
                  {updateRoleMutation.isPending && (
                    <div className="text-center py-2">
                      <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="h-4 w-4 animate-spin" />
                        Updating role...
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}