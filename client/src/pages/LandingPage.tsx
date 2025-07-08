import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  MessageSquare, 
  TrendingUp, 
  Users, 
  Shield, 
  Smartphone,
  CheckCircle,
  Star,
  Globe,
  Zap,
  Clock,
  BarChart3
} from "lucide-react";

export default function LandingPage() {
  const [email, setEmail] = useState("");

  const handleGetStarted = () => {
    window.location.href = "/login";
  };

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    // For now, redirect to sign up
    handleGetStarted();
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b bg-white/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-xl">Q</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">Quikpik Merchant</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={handleGetStarted}
                className="text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                Log In
              </Button>
              <Button onClick={handleGetStarted} className="bg-primary hover:bg-primary/90">
                Sign Up Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 pb-16 bg-gradient-to-br from-primary/5 via-white to-green-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-sm px-4 py-2">
                🚀 Built for Modern Businesses
              </Badge>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Connect
                <span className="block text-primary">Wholesalers</span>
                with Retailers
              </h1>
              
              <p className="text-xl text-gray-600 leading-relaxed">
                The modern B2B marketplace designed for wholesale businesses. 
                Streamline your operations, reach more retailers, and grow your business 
                with automated communication and instant payments.
              </p>
              
              <div className="flex items-center space-x-6 text-sm text-gray-600">
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  14-day free trial
                </span>
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Starting at $10.99/month
                </span>
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Cancel anytime
                </span>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={handleGetStarted}
                  size="lg" 
                  className="text-lg px-8 py-4 bg-primary hover:bg-primary/90"
                >
                  Start Selling Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={handleGetStarted}
                  className="text-lg px-8 py-4 border-2"
                >
                  Already have an account? Log In
                </Button>
              </div>
              
              <div className="flex items-center space-x-8 text-sm text-gray-600">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  Easy setup
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  WhatsApp integrated
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  Instant payments
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl p-8 border">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Metro Wholesale Hub</h3>
                    <Badge className="bg-green-100 text-green-800">Online</Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">$24K</div>
                      <div className="text-sm text-gray-600">This month</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">156</div>
                      <div className="text-sm text-gray-600">Active retailers</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        <span className="text-sm">New stock alert sent</span>
                      </div>
                      <span className="text-xs text-gray-500">2m ago</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        <span className="text-sm">New order received</span>
                      </div>
                      <span className="text-xs text-gray-500">5m ago</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Floating stats */}
              <div className="absolute -top-4 -right-4 bg-white rounded-lg shadow-lg p-4 border">
                <div className="flex items-center space-x-2">
                  <Star className="h-5 w-5 text-yellow-400 fill-current" />
                  <span className="font-semibold">4.9/5</span>
                  <span className="text-sm text-gray-600">rating</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Benefits Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything You Need to Scale
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 text-center border-0 shadow-lg">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Instant Broadcasting</h3>
              <p className="text-gray-600 text-sm">
                Send stock updates to all retailers instantly via WhatsApp
              </p>
            </Card>
            
            <Card className="p-6 text-center border-0 shadow-lg">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Secure Payments</h3>
              <p className="text-gray-600 text-sm">
                Get paid instantly with integrated payment processing
              </p>
            </Card>
            
            <Card className="p-6 text-center border-0 shadow-lg">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Smart Analytics</h3>
              <p className="text-gray-600 text-sm">
                Track sales and inventory with detailed insights
              </p>
            </Card>
          </div>
        </div>
      </section>




      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary/5 via-white to-green-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Ready to Transform Your Wholesale Business?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join hundreds of wholesalers who are already growing their business with Quikpik
          </p>
          
          <form onSubmit={handleWaitlist} className="max-w-md mx-auto mb-8">
            <div className="flex gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
              <Button type="submit" size="lg" className="px-8">
                Get Started
              </Button>
            </div>
          </form>
          
          <div className="flex items-center justify-center space-x-8 text-sm text-gray-600">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              Easy setup
            </div>
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              No credit card required
            </div>
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              Setup in 5 minutes
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center space-x-3 mb-8">
            <img 
              src="@assets/Quikpik - Products (2)_1751933843381.png" 
              alt="Quikpik Logo" 
              className="h-12 w-12"
            />
            <span className="text-2xl font-bold">Quikpik Merchant</span>
          </div>
          
          <div className="text-center text-gray-400">
            <p className="mb-4">
              Empowering wholesale businesses to reach more customers and grow faster.
            </p>
            <p className="mb-2">
              © 2025 Quikpik Merchant. Built with ❤️ for entrepreneurs worldwide.
            </p>
            <p>
              Questions? Contact us at <a href="mailto:hello@quikpik.co" className="text-primary hover:text-primary/80 transition-colors">hello@quikpik.co</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}