import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { PasswordStrengthIndicator } from "@/components/ui/password-strength-indicator";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Get token from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (!tokenFromUrl) {
      toast({
        title: "Invalid Reset Link",
        description: "No reset token found in the URL.",
        variant: "destructive",
      });
      setLocation('/login');
      return;
    }

    setToken(tokenFromUrl);
    validateToken(tokenFromUrl);
  }, []);

  const validateToken = async (resetToken: string) => {
    setIsValidating(true);
    
    try {
      const response = await fetch(`/api/auth/reset-password/${resetToken}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setIsValidToken(true);
        setEmail(data.email || "");
      } else {
        throw new Error(data.error || 'Invalid reset token');
      }
    } catch (error: any) {
      console.error('Token validation error:', error);
      toast({
        title: "Invalid Reset Link",
        description: error.message || "This reset link is invalid or has expired.",
        variant: "destructive",
      });
      setLocation('/login');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || !confirmPassword) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please ensure both password fields match.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsPasswordReset(true);
        toast({
          title: "Password Reset Successful",
          description: data.message,
        });
      } else {
        throw new Error(data.error || 'Failed to reset password');
      }
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-gray-600">Validating reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isPasswordReset) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-block mb-4 hover:opacity-80 transition-opacity">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-white font-bold text-xl">Q</span>
                </div>
              </div>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Password Reset Complete</h1>
            <p className="text-gray-600 mt-2">You can now sign in with your new password</p>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle>Password Reset Successful</CardTitle>
              <CardDescription>
                Your password has been updated successfully
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  <strong>Your password has been reset.</strong> You can now sign in to your account using your new password.
                </p>
              </div>

              <Link href="/login" className="w-full">
                <Button className="w-full h-12 text-base font-medium" size="lg" data-testid="goto-login-button">
                  Sign In Now
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-12">
            <p className="text-red-600 mb-4">Invalid or expired reset link</p>
            <Link href="/forgot-password">
              <Button>Request New Reset Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4 hover:opacity-80 transition-opacity">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                <span className="text-white font-bold text-xl">Q</span>
              </div>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Create New Password</h1>
          <p className="text-gray-600 mt-2">Enter your new secure password</p>
          {email && (
            <p className="mt-1 text-sm text-gray-500">
              Resetting password for: <span className="font-medium">{email}</span>
            </p>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-center">Reset Password</CardTitle>
            <CardDescription className="text-center">
              Choose a strong password for your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <PasswordStrengthIndicator
                  password={password}
                  onPasswordChange={setPassword}
                  placeholder="Enter your new password"
                  data-testid="reset-password-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <PasswordStrengthIndicator
                  password={confirmPassword}
                  onPasswordChange={setConfirmPassword}
                  placeholder="Confirm your new password"
                  showStrength={false}
                  data-testid="reset-confirm-password-input"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-red-600">Passwords don't match</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading || !password || !confirmPassword || password !== confirmPassword}
                className="w-full h-12 text-base font-medium"
                size="lg"
                data-testid="reset-password-submit-button"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Remember your password?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  <ArrowLeft className="inline h-3 w-3 mr-1" />
                  Back to Login
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}