import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Check, UserPlus, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AcceptInvitationProps {
  token?: string;
}

export default function AcceptInvitation({ token }: AcceptInvitationProps) {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    phoneNumber: '',
    firstName: '',
    lastName: ''
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: async (data: typeof formData & { token: string }) => {
      const response = await fetch('/api/customer/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to accept invitation');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Account Created Successfully!",
        description: "You can now access the wholesale platform. Redirecting to login...",
      });
      
      // Redirect to login after success
      setTimeout(() => {
        setLocation('/login');
      }, 2000);
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
    
    if (!token) {
      toast({
        title: "Invalid Link",
        description: "This invitation link is invalid or expired.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.email || !formData.firstName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    acceptInvitationMutation.mutate({ ...formData, token });
  };

  const handleInputChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl">Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setLocation('/login')} 
              className="w-full"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (acceptInvitationMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-xl text-green-700">Welcome to Quikpik!</CardTitle>
            <CardDescription>
              Your account has been created successfully. You now have access to your wholesaler's platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Redirecting to login page...
              </p>
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-emerald-600" />
          </div>
          <CardTitle className="text-xl">Complete Your Registration</CardTitle>
          <CardDescription>
            You've been invited to join a wholesale platform. Please complete your account setup.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange('firstName')}
                  required
                  disabled={acceptInvitationMutation.isPending}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleInputChange('lastName')}
                  disabled={acceptInvitationMutation.isPending}
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
                disabled={acceptInvitationMutation.isPending}
              />
            </div>

            <div>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={handleInputChange('phoneNumber')}
                placeholder="+44 7000 000000"
                disabled={acceptInvitationMutation.isPending}
              />
            </div>

            {acceptInvitationMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {acceptInvitationMutation.error.message}
                </AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={acceptInvitationMutation.isPending}
            >
              {acceptInvitationMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Complete Registration
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Button 
                variant="link" 
                onClick={() => setLocation('/login')}
                className="p-0 h-auto text-emerald-600 hover:text-emerald-700"
              >
                Sign in here
              </Button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}