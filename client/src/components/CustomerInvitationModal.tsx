import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, CheckCircle, UserPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CustomerInvitationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CustomerInvitationModal({ isOpen, onOpenChange }: CustomerInvitationModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    email: '',
    phoneNumber: '',
    firstName: '',
    lastName: '',
    customMessage: ''
  });

  const inviteCustomerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/wholesaler/invite-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send invitation');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Invitation Sent!" : "Invitation Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      
      if (data.success) {
        // Reset form
        setFormData({
          email: '',
          phoneNumber: '',
          firstName: '',
          lastName: '',
          customMessage: ''
        });
        
        // Refresh customer relationships
        queryClient.invalidateQueries({ queryKey: ['/api/wholesaler/customers'] });
        queryClient.invalidateQueries({ queryKey: ['/api/wholesaler/pending-invitations'] });
        
        // Close modal after successful invitation
        setTimeout(() => onOpenChange(false), 1500);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email) {
      toast({
        title: "Email Required",
        description: "Please enter the customer's email address.",
        variant: "destructive",
      });
      return;
    }
    
    inviteCustomerMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <UserPlus className="w-5 h-5 mr-2 text-emerald-600" />
            Invite New Customer
          </DialogTitle>
          <DialogDescription>
            Send an invitation to a customer to join your wholesale platform. They'll receive an email with instructions to create their account.
          </DialogDescription>
        </DialogHeader>

        {inviteCustomerMutation.isSuccess && inviteCustomerMutation.data?.success ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-700 mb-2">Invitation Sent!</h3>
            <p className="text-sm text-gray-600 mb-4">
              {inviteCustomerMutation.data.message}
            </p>
            <p className="text-xs text-gray-500">
              This dialog will close automatically...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange('firstName')}
                  disabled={inviteCustomerMutation.isPending}
                  placeholder="John"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleInputChange('lastName')}
                  disabled={inviteCustomerMutation.isPending}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange('email')}
                required
                disabled={inviteCustomerMutation.isPending}
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={handleInputChange('phoneNumber')}
                disabled={inviteCustomerMutation.isPending}
                placeholder="+44 7000 000000"
              />
            </div>

            <div>
              <Label htmlFor="customMessage">Personal Message (Optional)</Label>
              <Textarea
                id="customMessage"
                value={formData.customMessage}
                onChange={handleInputChange('customMessage')}
                disabled={inviteCustomerMutation.isPending}
                placeholder="Add a personal welcome message for this customer..."
                rows={3}
              />
            </div>

            {inviteCustomerMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {inviteCustomerMutation.error.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={inviteCustomerMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteCustomerMutation.isPending || !formData.email}
              >
                {inviteCustomerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}