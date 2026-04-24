import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import PageHeader from "@/components/PageHeader";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
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
  AlertTriangle,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Settings,
  Edit,
  Crown,
  PauseCircle,
  PlayCircle,
  MoreVertical,
  KeyRound,
  Phone,
  Eye
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamMember } from "@shared/schema";
import { SubscriptionUpgradeModal } from "@/components/subscription/SubscriptionUpgradeModal";

const teamMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  phoneNumber: z.string().optional(),
  role: z.enum(["admin", "member", "viewer"]),
  permissions: z.array(z.string()).default(["products", "orders", "customers"]),
});

type TeamMemberFormData = z.infer<typeof teamMemberSchema>;

function getTeamLimit(tier: string): number {
  switch (tier) {
    case 'free': return 1;
    case 'standard': return 3;
    case 'premium': return -1;
    default: return -1;
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
  const [, setLocation] = useLocation();
  const { checkTabAccess, permissionsLoading } = useSidebarPermissions();

  useEffect(() => {
    if (permissionsLoading) return;
    if (user?.role === 'team_member' && !checkTabAccess('team-management')) {
      toast({
        title: "Access restricted",
        description: "You don't have permission to view the Team Management page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, permissionsLoading, checkTabAccess, toast, setLocation]);

  // Subscription system removed
  // Subscription system removed - defaulting to premium tier
  const simpleTier = 'premium';
  const simpleIsActive = true;
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedMemberForRoleEdit, setSelectedMemberForRoleEdit] = useState<TeamMember | null>(null);
  const [isRoleEditOpen, setIsRoleEditOpen] = useState(false);
  const [phoneEditValue, setPhoneEditValue] = useState("");

  const form = useForm<TeamMemberFormData>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
      role: "member",
      permissions: ["products", "orders", "customers"],
    },
  });

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ["/api/team-members"],
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: ownerProfile } = useQuery<{
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    businessName: string | null;
  }>({
    queryKey: ["/api/owner-profile"],
    staleTime: 10 * 60 * 1000,
  });

  // Fetch plan limits for downgrade warning banner
  const { data: planLimits } = useQuery<{
    plan: string;
    limits: { products: number; broadcasts: number; teamMembers: number };
    usage: { products: number; broadcasts: number; teamMembers: number };
    cancelAtPeriodEnd: boolean;
    subscriptionPeriodEnd: string | null;
  }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    staleTime: 5 * 60 * 1000,
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
      if (error.message.includes("403") && error.message.toLowerCase().includes("team member")) {
        setIsInviteDialogOpen(false);
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

  const updatePhoneMutation = useMutation({
    mutationFn: async ({ memberId, phoneNumber }: { memberId: number; phoneNumber: string }) => {
      await apiRequest("PATCH", `/api/team-members/${memberId}/phone`, { phoneNumber });
    },
    onSuccess: () => {
      toast({ title: "Phone number saved", description: "SMS alerts will now be sent to this number." });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save phone number",
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ memberId, status }: { memberId: number; status: string }) => {
      await apiRequest("PATCH", `/api/team-members/${memberId}/status`, { status });
    },
    onSuccess: (_, { status }) => {
      toast({
        title: status === 'suspended' ? "Team member suspended" : "Team member reactivated",
        description: status === 'suspended'
          ? "They can no longer log in until reactivated."
          : "They can now log in again.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update member status",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const response = await apiRequest("POST", `/api/team-members/${memberId}/reset-password`);
      return response.json();
    },
    onSuccess: (data, memberId) => {
      const member = Array.isArray(teamMembers) ? teamMembers.find((m: TeamMember) => m.id === memberId) : null;
      toast({
        title: "Reset email sent",
        description: `Password reset link sent to ${member?.firstName || 'team member'}.`,
      });
    },
    onError: async (error: any) => {
      let msg = "Failed to send password reset email.";
      try { const d = await error.json?.(); if (d?.message) msg = d.message; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  // Using premium tier as default
  const teamLimit = getTeamLimit(simpleTier);
  const currentTeamCount = Array.isArray(teamMembers) ? teamMembers.length : 0;
  const canAddMembers = teamLimit === -1 || currentTeamCount < teamLimit;

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
    const token = (member as any).inviteToken || member.id;
    const inviteLink = `${window.location.origin}/team-invitation?token=${encodeURIComponent(token)}&email=${encodeURIComponent(member.email)}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "Invitation link copied",
      description: "You can now share this link directly with the team member.",
    });
  };

  const formatLastLogin = (lastLoginAt: string | null | undefined) => {
    if (!lastLoginAt) return 'Never logged in';
    const diff = Date.now() - new Date(lastLoginAt).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `Last active ${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `Last active ${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (mins > 0) return `Last active ${mins} minute${mins > 1 ? 's' : ''} ago`;
    return 'Last active just now';
  };

  const handleEditRole = (member: TeamMember) => {
    setSelectedMemberForRoleEdit(member);
    setPhoneEditValue(member.phoneNumber || "");
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

  // Premium access check - redirect non-premium users
  if (simpleTier !== 'premium') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="text-center py-12">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-yellow-100 rounded-full">
                <Crown className="h-8 w-8 text-yellow-600" />
              </div>
            </div>
            <CardTitle className="text-2xl mb-2">Premium Feature Required</CardTitle>
            <p className="text-gray-600 mb-6">
              Team Management is a premium feature that allows you to invite and manage team members with custom permissions.
            </p>
          </CardHeader>
          <CardContent>
            <div className="bg-yellow-50 p-4 rounded-lg mb-6">
              <h3 className="font-semibold text-yellow-800 mb-2">Premium Plan includes:</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Unlimited team members</li>
                <li>• Custom role permissions</li>
                <li>• Team invitation management</li>
                <li>• Advanced access controls</li>
              </ul>
            </div>
            <Button 
              onClick={() => setShowUpgradeModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade to Premium
            </Button>
          </CardContent>
        </Card>
        
        {/* Upgrade Modal */}
        <SubscriptionUpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          currentPlan={simpleTier}
          reason="team_member_limit"
        />
      </div>
    );
  }

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
    <div className="bg-white min-h-screen">
      <PageHeader title="Team" description="Manage team access and permissions">
        {user?.role !== 'team_member' && (
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => {
                if (!canAddMembers) {
                  setShowUpgradeModal(true);
                }
              }}
              className={canAddMembers ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}
              disabled={!canAddMembers}
            >
              {!canAddMembers ? (
                <Crown className="h-4 w-4 sm:mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">
                {!canAddMembers ? "Upgrade Required" : "Invite Team Member"}
              </span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number <span className="text-gray-400 font-normal">(optional — for SMS stock alerts)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="+44XXXXXXXXXX" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                          <SelectItem value="viewer" textValue="Viewer">
                            <div className="flex flex-col py-1">
                              <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4 text-purple-500" />
                                <span className="font-medium">Viewer</span>
                              </div>
                              <span className="text-xs text-gray-500">Read-only — can view but cannot make any changes</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="member" textValue="Member">
                            <div className="flex flex-col py-1">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-gray-400" />
                                <span className="font-medium">Member</span>
                              </div>
                              <span className="text-xs text-gray-500">Access only to areas you allow in Tab Permissions</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin" textValue="Admin">
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
                      <div className="bg-blue-50 p-3 rounded-lg mt-2 space-y-1">
                        <p className="text-xs text-blue-800">
                          <strong>Note:</strong> The Owner role cannot be assigned via invite — it belongs to the account holder only.
                        </p>
                        <p className="text-xs text-blue-700">
                          <strong>Admin</strong> — full operational access to all business areas.{' '}
                          <strong>Member</strong> — access limited to areas you configure in Tab Permissions.{' '}
                          <strong>Viewer</strong> — read-only, cannot make any changes.
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsInviteDialogOpen(false)}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={inviteMemberMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                  >
                    {inviteMemberMutation.isPending ? "Sending..." : "Send Invitation"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </PageHeader>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Read-only banner for team members */}
      {user?.role === 'team_member' && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-sm text-blue-800">
            You are viewing team management in read-only mode. Only the account owner can invite, edit, or remove team members.
          </p>
        </div>
      )}

      {/* Downgrade warning banner */}
      {planLimits?.cancelAtPeriodEnd && (planLimits.usage.teamMembers > 0) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm text-amber-800">
            <span className="font-semibold">Downgrade scheduled: </span>
            Your plan will move to Free
            {planLimits.subscriptionPeriodEnd
              ? ' on ' + new Date(planLimits.subscriptionPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
              : ''}
            . The Free plan is owner-only — {planLimits.usage.teamMembers} team member{planLimits.usage.teamMembers !== 1 ? 's' : ''} will lose access at that time.{' '}
            <a href="/subscription-pricing" className="font-semibold underline hover:text-amber-900">View billing →</a>
          </div>
        </div>
      )}

      {/* Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Limits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <p className="text-sm text-gray-600">
                Current Plan: <span className="font-semibold capitalize">{simpleTier}</span>
              </p>
              <p className="text-sm text-gray-600">
                Team Members: {currentTeamCount} / {teamLimit === -1 ? "unlimited" : teamLimit}
              </p>
            </div>
            {simpleTier === 'free' && (
              <Button 
                onClick={() => setShowUpgradeModal(true)}
                variant="outline"
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 w-full sm:w-auto"
              >
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to Add Team Members
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Content with Tabs */}
      <Tabs defaultValue="members" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="members" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team Members</span>
            <span className="sm:hidden">Members</span>
          </TabsTrigger>
          <TabsTrigger value="permissions" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Tab Permissions</span>
            <span className="sm:hidden">Permissions</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Team Members</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
          <div className="space-y-2">
            {/* Owner row — always at top, no action buttons, visible to all roles */}
            {ownerProfile && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg gap-2 sm:gap-2 bg-amber-50 border-amber-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Crown className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {[ownerProfile.firstName, ownerProfile.lastName].filter(Boolean).join(' ') || ownerProfile.businessName || ownerProfile.email}
                    </h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{ownerProfile.email}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <Badge className="text-xs bg-amber-500 text-white">Owner</Badge>
                  <span className="text-xs text-gray-500 hidden sm:inline">Account holder</span>
                </div>
              </div>
            )}

            {/* Team member list or empty state */}
            {!Array.isArray(teamMembers) || teamMembers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-1">No team members yet</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {simpleTier === 'free'
                    ? "Upgrade your plan to invite team members and collaborate on your wholesale platform."
                    : "Invite team members to help manage your wholesale platform."
                  }
                </p>
                {simpleTier !== 'free' && user?.role !== 'team_member' && (
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
            <div className="space-y-2">
              {Array.isArray(teamMembers) && teamMembers.map((member: TeamMember) => (
                <div
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg gap-2 sm:gap-2"
                >
                  {/* Identity: Avatar + Name + Email */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-emerald-700 font-semibold text-xs">
                        {member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {member.firstName} {member.lastName}
                      </h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </p>
                      {member.phoneNumber && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span>{member.phoneNumber}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Meta + Actions: stacked on mobile, horizontal on sm+ */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    {/* Status + Role badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        {getStatusIcon(member.status)}
                        <Badge variant={getStatusBadgeVariant(member.status)} className="text-xs">
                          {member.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {member.role === 'admin' ? (
                          <ShieldCheck className="h-4 w-4 text-blue-500" />
                        ) : member.role === 'viewer' ? (
                          <Eye className="h-4 w-4 text-purple-500" />
                        ) : (
                          <Shield className="h-4 w-4 text-gray-400" />
                        )}
                        <Badge
                          variant={member.role === 'admin' ? 'default' : 'outline'}
                          className={`text-xs ${member.role === 'admin' ? 'bg-blue-500 text-white' : member.role === 'viewer' ? 'border-purple-300 text-purple-700' : ''}`}
                        >
                          {member.role === 'admin' ? 'Admin' : member.role === 'viewer' ? 'Viewer' : 'Member'}
                        </Badge>
                        <span className="text-xs text-gray-500 hidden sm:inline">
                          {member.role === 'admin' ? 'Full Access' : member.role === 'viewer' ? 'View Only' : 'Limited Access'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 hidden sm:block">
                        {formatLastLogin((member as any).lastLoginAt)}
                      </p>
                    </div>

                    {/* Action buttons */}
                    {user?.role !== 'team_member' ? (
                      <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                        {member.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResendInvite(member.id)}
                              disabled={resendInviteMutation.isPending}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 text-xs"
                            >
                              <Mail className="h-3 w-3 mr-1" />
                              {resendInviteMutation.isPending ? "Sending..." : "Resend Email"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyInviteLink(member)}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200 text-xs"
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy Link
                            </Button>
                          </>
                        )}
                        {member.status !== 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRole(member)}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200 text-xs"
                            aria-label="Edit role"
                            title="Edit role"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700 text-xs px-2">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {member.status !== 'pending' && (
                              <DropdownMenuItem
                                onClick={() => resetPasswordMutation.mutate(member.id)}
                                className="text-blue-600"
                                disabled={resetPasswordMutation.isPending}
                              >
                                <KeyRound className="h-4 w-4 mr-2" />
                                Send password reset
                              </DropdownMenuItem>
                            )}
                            {member.status === 'active' && (
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ memberId: member.id, status: 'suspended' })}
                                className="text-amber-600"
                              >
                                <PauseCircle className="h-4 w-4 mr-2" />
                                Suspend access
                              </DropdownMenuItem>
                            )}
                            {member.status === 'suspended' && (
                              <DropdownMenuItem
                                onClick={() => updateStatusMutation.mutate({ memberId: member.id, status: 'active' })}
                                className="text-green-600"
                              >
                                <PlayCircle className="h-4 w-4 mr-2" />
                                Reactivate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteMember(member.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Read only</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-6">
          <TabPermissionsManager />
        </TabsContent>
      </Tabs>

      {/* Only show upgrade modal if user is not already on premium */}
      {simpleTier !== 'premium' && (
        <SubscriptionUpgradeModal 
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          reason="team_member_limit"
          currentPlan={simpleTier}
        />
      )}

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

                    <Button
                      variant={selectedMemberForRoleEdit.role === 'viewer' ? 'default' : 'outline'}
                      className={`w-full justify-start ${selectedMemberForRoleEdit.role === 'viewer' ? 'bg-purple-500 text-white' : 'text-purple-600 hover:bg-purple-50 border-purple-200'}`}
                      onClick={() => handleUpdateRole('viewer')}
                      disabled={updateRoleMutation.isPending}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      <div className="text-left">
                        <div className="font-medium">Viewer</div>
                        <div className="text-xs opacity-75">Read-only — can view data but cannot make changes</div>
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

                <div className="border-t pt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    Mobile number for SMS stock alerts
                  </p>
                  <p className="text-xs text-gray-400">Optional. If set, this team member will receive SMS notifications when products go low in stock.</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="+44XXXXXXXXXX"
                      value={phoneEditValue}
                      onChange={(e) => setPhoneEditValue(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updatePhoneMutation.isPending}
                      onClick={() => {
                        if (selectedMemberForRoleEdit) {
                          updatePhoneMutation.mutate({
                            memberId: selectedMemberForRoleEdit.id,
                            phoneNumber: phoneEditValue,
                          });
                        }
                      }}
                    >
                      {updatePhoneMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}