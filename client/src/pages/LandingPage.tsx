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
  Package,
  Calendar,
  Users2,
  Phone,
  Video
} from "lucide-react";

export default function LandingPage() {
  const [email, setEmail] = useState("");

  const handleGetStarted = () => {
    window.location.href = "/signup";
  };

  const handleWholesaleLogin = () => {
    window.location.href = "/login";
  };

  const handleCustomerLogin = () => {
    // For customer login, we'll create a simple page to enter wholesaler ID
    window.location.href = "/customer-login";
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
            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                onClick={handleCustomerLogin}
                className="text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                Customer Login
              </Button>
              <Button 
                variant="ghost" 
                onClick={handleWholesaleLogin}
                className="text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                Wholesale Login
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
                  onClick={handleWholesaleLogin}
                  className="text-lg px-8 py-4 border-2"
                >
                  Already have an account? Log In
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center bg-gradient-to-r from-emerald-50 to-emerald-100 px-4 py-2 rounded-full border border-emerald-200">
                  <CheckCircle className="h-5 w-5 text-emerald-500 mr-2" />
                  <span className="font-semibold text-emerald-700">Easy setup</span>
                </div>
                <div className="flex items-center bg-gradient-to-r from-sky-50 to-sky-100 px-4 py-2 rounded-full border border-sky-200">
                  <MessageSquare className="h-5 w-5 text-sky-500 mr-2" />
                  <span className="font-semibold text-sky-700">WhatsApp integrated</span>
                </div>
                <div className="flex items-center bg-gradient-to-r from-yellow-50 to-yellow-100 px-4 py-2 rounded-full border border-yellow-200">
                  <CreditCard className="h-5 w-5 text-yellow-500 mr-2" />
                  <span className="font-semibold text-yellow-700">Instant payments</span>
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
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-lg border border-emerald-200">
                      <div className="flex items-center mb-2">
                        <TrendingUp className="h-5 w-5 text-emerald-500 mr-2" />
                        <span className="text-sm font-medium text-emerald-700">Revenue</span>
                      </div>
                      <div className="text-2xl font-bold text-emerald-800">£24K</div>
                      <div className="text-sm text-emerald-600">This month</div>
                    </div>
                    <div className="bg-gradient-to-br from-sky-50 to-sky-100 p-4 rounded-lg border border-sky-200">
                      <div className="flex items-center mb-2">
                        <Users className="h-5 w-5 text-sky-500 mr-2" />
                        <span className="text-sm font-medium text-sky-700">Customers</span>
                      </div>
                      <div className="text-2xl font-bold text-sky-800">156</div>
                      <div className="text-sm text-sky-600">Active retailers</div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
                      <div className="flex items-center">
                        <div className="flex items-center">
                          <MessageSquare className="h-5 w-5 text-yellow-500 mr-2" />
                          <span className="text-yellow-700 font-medium">New stock alert sent</span>
                        </div>
                        <span className="ml-auto text-sm text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">2m ago</span>
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 p-4 rounded-lg border border-emerald-200">
                      <div className="flex items-center">
                        <div className="flex items-center">
                          <Package className="h-5 w-5 text-emerald-500 mr-2" />
                          <span className="text-emerald-700 font-medium">Order from Kano received</span>
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
            <Card className="p-6 text-center border-0 shadow-lg bg-gradient-to-br from-sky-50 to-sky-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-sky-500 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <MessageSquare className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-sky-800">Instant Broadcasting</h3>
              <p className="text-sky-700 text-sm font-medium">
                Send stock updates to all retailers instantly via WhatsApp
              </p>
            </Card>
            
            <Card className="p-6 text-center border-0 shadow-lg bg-gradient-to-br from-yellow-50 to-yellow-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-yellow-800">Secure Payments</h3>
              <p className="text-yellow-700 text-sm font-medium">
                Get paid instantly with integrated payment processing
              </p>
            </Card>
            
            <Card className="p-6 text-center border-0 shadow-lg bg-gradient-to-br from-rose-50 to-rose-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 bg-gradient-to-br from-rose-400 to-rose-500 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-rose-800">Smart Analytics</h3>
              <p className="text-rose-700 text-sm font-medium">
                Track sales and inventory with detailed insights
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Free Support Section */}
      <section className="py-20 bg-gradient-to-br from-emerald-50 via-white to-green-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-sm px-4 py-2 mb-6">
              💬 Premium Support Included
            </Badge>
            <h2 className="text-4xl font-bold text-gray-900 mb-6">
              Free In-Person Support & Training
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Get personalized help from our experts. We'll guide you through setup, 
              answer your questions, and help you maximize your wholesale business potential.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Video className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">One-on-One Setup Sessions</h3>
                  <p className="text-gray-600">Personal video calls to help you configure your account, upload products, and set up customer groups.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Priority Phone Support</h3>
                  <p className="text-gray-600">Direct access to our support team for urgent questions and technical assistance.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Team Training Sessions</h3>
                  <p className="text-gray-600">Group training for your entire team to ensure everyone knows how to use the platform effectively.</p>
                </div>
              </div>
              
              <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200">
                <div className="flex items-center mb-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 mr-2" />
                  <span className="font-semibold text-emerald-800">100% Free</span>
                </div>
                <p className="text-emerald-700 text-sm">
                  All support services are included with your subscription at no extra cost. 
                  We're committed to your success.
                </p>
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Book Your Free Session</h3>
                <p className="text-gray-600">Choose a time that works for you</p>
              </div>
              
              {/* Calendly Integration */}
              <div className="space-y-4">
                <Button 
                  onClick={() => window.open('https://calendly.com/quikpik-support/setup-session', '_blank')}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 text-lg font-medium"
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  Schedule Setup Session
                </Button>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => window.open('https://calendly.com/quikpik-support/training-session', '_blank')}
                    className="py-3 text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  >
                    <Users2 className="mr-2 h-4 w-4" />
                    Team Training
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => window.open('https://calendly.com/quikpik-support/quick-help', '_blank')}
                    className="py-3 text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Quick Help
                  </Button>
                </div>
                
                <div className="text-center pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500 mb-2">Available time slots:</p>
                  <div className="flex items-center justify-center space-x-4 text-xs text-gray-600">
                    <span>Mon-Fri: 9AM-6PM GMT</span>
                    <span>•</span>
                    <span>Weekend support available</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-16 text-center">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 inline-block">
              <p className="text-lg font-semibold text-gray-900 mb-2">
                Need immediate help?
              </p>
              <p className="text-gray-600 mb-4">
                Email us at <a href="mailto:support@quikpik.co" className="text-emerald-600 hover:text-emerald-700 font-medium">support@quikpik.co</a>
              </p>
              <p className="text-sm text-gray-500">
                We typically respond within 2 hours during business hours
              </p>
            </div>
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