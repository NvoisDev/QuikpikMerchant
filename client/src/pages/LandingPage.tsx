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
  BarChart3,
  CreditCard,
  Package
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
            <div className="flex items-center">
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
                  Easy setup
                </span>
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Starting at £10.99/month
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
              
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center bg-gradient-to-r from-green-100 to-emerald-100 px-4 py-2 rounded-full border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  <span className="font-semibold text-green-800">Easy setup</span>
                </div>
                <div className="flex items-center bg-gradient-to-r from-blue-100 to-cyan-100 px-4 py-2 rounded-full border border-blue-200">
                  <MessageSquare className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="font-semibold text-blue-800">WhatsApp integrated</span>
                </div>
                <div className="flex items-center bg-gradient-to-r from-purple-100 to-violet-100 px-4 py-2 rounded-full border border-purple-200">
                  <CreditCard className="h-5 w-5 text-purple-600 mr-2" />
                  <span className="font-semibold text-purple-800">Instant payments</span>
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
                    <div className="bg-gradient-to-br from-green-50 to-emerald-100 p-4 rounded-lg border border-green-200">
                      <div className="flex items-center mb-2">
                        <TrendingUp className="h-5 w-5 text-green-600 mr-2" />
                        <span className="text-sm font-medium text-green-800">Revenue</span>
                      </div>
                      <div className="text-2xl font-bold text-green-900">£24K</div>
                      <div className="text-sm text-green-700">This month</div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-100 p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center mb-2">
                        <Users className="h-5 w-5 text-blue-600 mr-2" />
                        <span className="text-sm font-medium text-blue-800">Customers</span>
                      </div>
                      <div className="text-2xl font-bold text-blue-900">156</div>
                      <div className="text-sm text-blue-700">Active retailers</div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 rounded-lg border border-orange-200">
                      <div className="flex items-center">
                        <div className="flex items-center">
                          <MessageSquare className="h-5 w-5 text-orange-600 mr-2" />
                          <span className="text-orange-800 font-medium">New stock alert sent</span>
                        </div>
                        <span className="ml-auto text-sm text-orange-600 bg-orange-100 px-2 py-1 rounded-full">2m ago</span>
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-emerald-50 to-green-50 p-4 rounded-lg border border-emerald-200">
                      <div className="flex items-center">
                        <div className="flex items-center">
                          <Package className="h-5 w-5 text-emerald-600 mr-2" />
                          <span className="text-emerald-800 font-medium">Order from Kano received</span>
                        </div>
                        <span className="ml-auto text-sm text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">5m ago</span>
                      </div>
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
            <Card className="p-6 text-center border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <MessageSquare className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-blue-900">Instant Broadcasting</h3>
              <p className="text-blue-700 text-sm font-medium">
                Send stock updates to all retailers instantly via WhatsApp
              </p>
            </Card>
            
            <Card className="p-6 text-center border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-emerald-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-emerald-900">Secure Payments</h3>
              <p className="text-emerald-700 text-sm font-medium">
                Get paid instantly with integrated payment processing
              </p>
            </Card>
            
            <Card className="p-6 text-center border-0 shadow-lg bg-gradient-to-br from-purple-50 to-purple-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-purple-900">Smart Analytics</h3>
              <p className="text-purple-700 text-sm font-medium">
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
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold">Quikpik Merchant</h3>
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