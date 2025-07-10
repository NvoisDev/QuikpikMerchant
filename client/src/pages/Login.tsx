import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [teamMemberLogin, setTeamMemberLogin] = useState({ email: '', password: '' });
  const [businessOwnerLogin, setBusinessOwnerLogin] = useState({ email: '', password: '' });
  const [loginMethod, setLoginMethod] = useState<'google' | 'email'>('google');
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      
      // Get Google auth URL from server
      const response = await fetch('/api/auth/google');
      const data = await response.json();
      
      if (data.authUrl) {
        // Redirect to Google authentication
        window.location.href = data.authUrl;
      } else {
        throw new Error('Failed to get authentication URL');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Login Failed",
        description: "There was an error signing you in. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleBusinessOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(businessOwnerLogin),
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully.",
        });
        setLocation('/');
      } else {
        throw new Error(data.message || 'Login failed');
      }
    } catch (error: any) {
      console.error('Business owner login error:', error);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeamMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/auth/team-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(teamMemberLogin),
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully.",
        });
        setLocation('/');
      } else {
        throw new Error(data.message || 'Login failed');
      }
    } catch (error: any) {
      console.error('Team member login error:', error);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-white to-green-50">
      <div className="w-full max-w-md space-y-8 px-4">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-xl">Q</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome to Quikpik
          </h1>
          <p className="mt-2 text-gray-600">
            Your B2B wholesale marketplace platform
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              Choose your login method to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="business" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="business">Business Owner</TabsTrigger>
                <TabsTrigger value="team">Team Member</TabsTrigger>
              </TabsList>
              
              <TabsContent value="business" className="space-y-4">
                <div className="text-center py-2">
                  <p className="text-sm text-gray-600 mb-4">
                    Choose your preferred sign-in method
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      variant={loginMethod === 'google' ? 'default' : 'outline'}
                      onClick={() => setLoginMethod('google')}
                      className="flex-1"
                    >
                      Google
                    </Button>
                    <Button
                      variant={loginMethod === 'email' ? 'default' : 'outline'}
                      onClick={() => setLoginMethod('email')}
                      className="flex-1"
                    >
                      Email
                    </Button>
                  </div>
                </div>

                {loginMethod === 'google' ? (
                  <div className="space-y-4">
                    <Button
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      className="w-full h-12 text-base font-medium"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          <LogIn className="mr-2 h-5 w-5" />
                          Sign in with Google
                        </>
                      )}
                    </Button>
                    <div className="text-center text-sm text-gray-500">
                      <p>Secure sign-in powered by Google OAuth 2.0</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleBusinessOwnerLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="business-email">Email Address</Label>
                      <Input
                        id="business-email"
                        type="email"
                        placeholder="your.email@company.com"
                        value={businessOwnerLogin.email}
                        onChange={(e) => setBusinessOwnerLogin({...businessOwnerLogin, email: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-password">Password</Label>
                      <Input
                        id="business-password"
                        type="password"
                        placeholder="Enter your password"
                        value={businessOwnerLogin.password}
                        onChange={(e) => setBusinessOwnerLogin({...businessOwnerLogin, password: e.target.value})}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 text-base font-medium"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          <LogIn className="mr-2 h-5 w-5" />
                          Sign in with Email
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </TabsContent>
              
              <TabsContent value="team" className="space-y-4">
                <div className="text-center py-2">
                  <p className="text-sm text-gray-600 mb-4">
                    Sign in with your team member credentials
                  </p>
                </div>
                <form onSubmit={handleTeamMemberLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@company.com"
                      value={teamMemberLogin.email}
                      onChange={(e) => setTeamMemberLogin({...teamMemberLogin, email: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={teamMemberLogin.password}
                      onChange={(e) => setTeamMemberLogin({...teamMemberLogin, password: e.target.value})}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 text-base font-medium"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <Users className="mr-2 h-5 w-5" />
                        Sign in as Team Member
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center space-y-3">
          <p className="text-sm text-gray-600">
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline font-medium">
              Sign up for free
            </Link>
          </p>
          <p className="text-xs text-gray-500">
            By signing in, you agree to our{" "}
            <a href="#" className="text-primary hover:underline">
              terms of service
            </a>{" "}
            and{" "}
            <a href="#" className="text-primary hover:underline">
              privacy policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}