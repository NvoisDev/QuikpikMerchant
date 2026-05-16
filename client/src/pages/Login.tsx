import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, Loader2, Users, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [teamMemberLogin, setTeamMemberLogin] = useState({ email: '', password: '' });
  const [businessOwnerLogin, setBusinessOwnerLogin] = useState({ email: '', password: '' });
  const [loginMethod, setLoginMethod] = useState<'google' | 'email'>('google');
  const [teamMemberNotice, setTeamMemberNotice] = useState(false);
  const [defaultTab, setDefaultTab] = useState<'business' | 'team'>('business');
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { backToHome } = useAuth();

  // Check for URL error params and show helpful messages
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const expired = urlParams.get('expired');
    const error = urlParams.get('error');
    
    if (expired === 'true') {
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please sign in again to continue.",
        variant: "default",
      });
    }
    if (error === 'team_member_use_tab') {
      setTeamMemberNotice(true);
      setDefaultTab('team');
    }
    // Clean up the URL
    if (expired || error) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast]);

  const handleBackToHome = () => {
    // Clear any existing session and go to landing page
    backToHome();
  };

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
        // Invalidate auth queries to refresh user state
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        
        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully.",
        });
        
        // Small delay to ensure auth state is updated
        setTimeout(() => {
          setLocation('/');
        }, 100);
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
        // Invalidate auth queries to refresh user state
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        
        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully.",
        });
        
        // Small delay to ensure auth state is updated
        setTimeout(() => {
          setLocation('/');
        }, 100);
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
    <div className="min-h-screen flex bg-slate-50">
      {/* Left branding panel — hidden on small screens */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between bg-slate-900 px-12 py-16 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-9 w-9 object-contain" />
            <span className="text-white font-semibold text-lg tracking-tight">Quikpik</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">
            The wholesale platform built for growth
          </h2>
          <p className="text-slate-400 text-base leading-relaxed">
            Manage orders, customers, products, and revenue — all in one place.
          </p>
        </div>
        <div className="space-y-4">
          {[
            { label: "Start free", value: "No credit card" },
            { label: "Save hours on admin", value: "Automated" },
            { label: "Price lists", value: "Per customer" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between border-t border-slate-800 pt-4">
              <span className="text-slate-400 text-sm">{item.label}</span>
              <span className="text-emerald-400 text-sm font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img src="/quikpik-logo.png" alt="Quikpik" className="mx-auto h-12 w-12 object-contain mb-4" />
            <h1 className="text-2xl font-bold text-slate-900">Quikpik</h1>
          </div>

          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
            <p className="mt-1 text-slate-500 text-sm">
              Sign in to your account to continue.{" "}
              <button 
                onClick={handleBackToHome}
                className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-sm"
              >
                ← Back to Home
              </button>
            </p>
          </div>

        {/* Team member notice banner */}
        {teamMemberNotice && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>You're a team member.</strong> Google sign-in is for business owners only.
              Please use the <strong>Team Member</strong> tab below to sign in with your email and password.
            </span>
          </div>
        )}

        {/* Login Card */}
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900">Sign In</CardTitle>
            <CardDescription className="text-slate-500">
              Choose your login method to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={defaultTab} onValueChange={(v) => setDefaultTab(v as 'business' | 'team')} className="w-full">
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
                      <div className="flex justify-between items-center">
                        <Label htmlFor="business-password">Password</Label>
                        <Link 
                          href="/forgot-password" 
                          className="text-sm text-primary hover:underline"
                          data-testid="business-forgot-password-link"
                        >
                          Forgot Password?
                        </Link>
                      </div>
                      <Input
                        id="business-password"
                        type="password"
                        placeholder="Enter your password"
                        value={businessOwnerLogin.password}
                        onChange={(e) => setBusinessOwnerLogin({...businessOwnerLogin, password: e.target.value})}
                        required
                        data-testid="business-password-input"
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
                    <div className="flex justify-between items-center">
                      <Label htmlFor="password">Password</Label>
                      <Link 
                        href="/forgot-password" 
                        className="text-sm text-primary hover:underline"
                        data-testid="team-forgot-password-link"
                      >
                        Forgot Password?
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={teamMemberLogin.password}
                      onChange={(e) => setTeamMemberLogin({...teamMemberLogin, password: e.target.value})}
                      required
                      data-testid="team-password-input"
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
        <div className="text-center space-y-3 pt-2">
          <p className="text-sm text-slate-600">
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline font-medium">
              Sign up for free
            </Link>
          </p>
          <p className="text-xs text-slate-400">
            By signing in, you agree to our{" "}
            <Link href="/terms" className="text-primary hover:underline">
              terms of service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}