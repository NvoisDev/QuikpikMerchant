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
    window.location.href = "/api/auth/google";
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
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-white font-bold text-xl">Q</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">Quikpik</span>
            </div>
            <Button onClick={handleGetStarted} className="bg-primary hover:bg-primary/90">
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 pb-16 bg-gradient-to-br from-primary/5 via-white to-green-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-sm px-4 py-2">
                🇳🇬 Built for Nigerian Businesses
              </Badge>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Connect Nigerian
                <span className="block text-primary">Wholesalers</span>
                with Retailers
              </h1>
              
              <p className="text-xl text-gray-600 leading-relaxed">
                The first B2B marketplace designed specifically for Nigerian retail businesses. 
                Streamline your wholesale operations, reach more retailers, and grow your business 
                with WhatsApp integration and instant payments.
              </p>
              
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
                  className="text-lg px-8 py-4 border-2"
                >
                  Watch Demo
                </Button>
              </div>
              
              <div className="flex items-center space-x-8 text-sm text-gray-600">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  Free to start
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
                    <h3 className="font-semibold text-gray-900">Lagos Wholesale Hub</h3>
                    <Badge className="bg-green-100 text-green-800">Online</Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">₦2.4M</div>
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
                        <span className="text-sm">Order from Kano received</span>
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

      {/* Problems Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Challenges Every Nigerian Wholesaler Faces
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Running a wholesale business in Nigeria shouldn't be this complicated
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8 text-center border-0 shadow-lg">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Manual Communication</h3>
              <p className="text-gray-600">
                Sending product updates to hundreds of retailers one by one through WhatsApp 
                takes hours and leads to missed opportunities.
              </p>
            </Card>
            
            <Card className="p-8 text-center border-0 shadow-lg">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="h-8 w-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold mb-4">No Business Insights</h3>
              <p className="text-gray-600">
                Without proper tracking, you can't see which products sell best, 
                which customers buy most, or when to restock.
              </p>
            </Card>
            
            <Card className="p-8 text-center border-0 shadow-lg">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Slow Payment Collection</h3>
              <p className="text-gray-600">
                Chasing payments from retailers wastes time that could be spent 
                growing your business and finding new customers.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              How Quikpik Transforms Your Business
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Everything you need to run a modern wholesale business in one platform
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="space-y-8">
              <div className="flex space-x-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Smartphone className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">WhatsApp Automation</h3>
                  <p className="text-gray-600">
                    Send stock updates, price changes, and new product alerts to all your 
                    retailers instantly through WhatsApp Business API.
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Secure Payments</h3>
                  <p className="text-gray-600">
                    Get paid instantly with integrated payment processing. 
                    Support for cards, bank transfers, and mobile money.
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Business Analytics</h3>
                  <p className="text-gray-600">
                    Track sales, monitor inventory, and get insights into your 
                    best-performing products and customers.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-2">
              <div className="bg-gradient-to-br from-primary/5 to-green-50 rounded-2xl p-8">
                <img 
                  src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDYwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI2MDAiIGhlaWdodD0iNDAwIiByeD0iMTIiIGZpbGw9IndoaXRlIi8+CjxyZWN0IHg9IjIwIiB5PSIyMCIgd2lkdGg9IjU2MCIgaGVpZ2h0PSIzNjAiIHJ4PSI4IiBmaWxsPSIjRjlGQUZCIiBzdHJva2U9IiNFNUU3RUIiLz4KPHJlY3QgeD0iNDAiIHk9IjQwIiB3aWR0aD0iMTgwIiBoZWlnaHQ9IjEyMCIgcng9IjgiIGZpbGw9IiMyMkM1NUUiIG9wYWNpdHk9IjAuMSIvPgo8Y2lyY2xlIGN4PSI2MCIgY3k9IjcwIiByPSIxMiIgZmlsbD0iIzIyQzU1RSIvPgo8dGV4dCB4PSI4NSIgeT0iNzgiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMxMTExMTEiPkxhZ29zIFdob2xlc2FsZSBIdWI8L3RleHQ+Cjx0ZXh0IHg9IjYwIiB5PSIxMDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMxMTExMTEiPuKCpjIuNE08L3RleHQ+Cjx0ZXh0IHg9IjYwIiB5PSIxMjAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzY5NzU4NSI+VGhpcyBtb250aDwvdGV4dD4KPHRleHQgeD0iMTQwIiB5PSIxMDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMxMTExMTEiPjE1NjwvdGV4dD4KPHRleHQgeD0iMTQwIiB5PSIxMjAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzY5NzU4NSI+QWN0aXZlIHJldGFpbGVyczwvdGV4dD4KPHJlY3QgeD0iMjYwIiB5PSI0MCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI4MCIgcng9IjgiIGZpbGw9IndoaXRlIiBzdHJva2U9IiNFNUU3RUIiLz4KPHN2ZyB4PSIyODAiIHk9IjU1IiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0yMS45OSA0SDE2TDEzLjk5IDJINEMyLjkgMiAyIDIuOSAyIDRWMjBDMiAyMS4xIDIuOSAyMiA0IDIySDE2QzE3LjEgMjIgMTggMjEuMSAxOCAyMFY0QzE4IDIuOSAxNy4xIDIgMTYgMloiIGZpbGw9IiMyMkM1NUUiLz4KPC9zdmc+Cjx0ZXh0IHg9IjMxMCIgeT0iNzAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzExMTExMSI+TmV3IHN0b2NrIGFsZXJ0IHNlbnQ8L3RleHQ+Cjx0ZXh0IHg9IjUyMCIgeT0iNzAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzY5NzU4NSI+Mm0gYWdvPC90ZXh0Pgo8cmVjdCB4PSIyNjAiIHk9IjE0MCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI4MCIgcng9IjgiIGZpbGw9IndoaXRlIiBzdHJva2U9IiNFNUU3RUIiLz4KPHN2ZyB4PSIyODAiIHk9IjE1NSIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiPgo8cGF0aCBkPSJNNyAxNEw5IDE2TDE3IDgiIHN0cm9rZT0iIzE2QTM0QSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+Cjx0ZXh0IHg9IjMxMCIgeT0iMTcwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiMxMTExMTEiPk9yZGVyIGZyb20gS2FubyByZWNlaXZlZDwvdGV4dD4KPHRleHQgeD0iNTEwIiB5PSIxNzAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzY5NzU4NSI+NW0gYWdvPC90ZXh0Pgo8L3N2Zz4K"
                  alt="Quikpik Dashboard"
                  className="w-full h-auto rounded-lg shadow-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Nigerian Market Section */}
      <section className="py-20 bg-gradient-to-br from-green-900 to-green-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="bg-white/20 text-white mb-6">
                🌍 Designed for Nigeria
              </Badge>
              <h2 className="text-4xl font-bold mb-6">
                Built for the Nigerian Market
              </h2>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <Globe className="h-6 w-6 text-green-300 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">Multi-State Coverage</h3>
                    <p className="text-green-100">
                      Connect with retailers across Lagos, Kano, Abuja, Port Harcourt, 
                      and every major Nigerian city.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <Zap className="h-6 w-6 text-green-300 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">Local Payment Methods</h3>
                    <p className="text-green-100">
                      Support for Nigerian banks, mobile money, and payment methods 
                      your customers already use and trust.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <MessageSquare className="h-6 w-6 text-green-300 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">WhatsApp Integration</h3>
                    <p className="text-green-100">
                      Leverage the communication platform every Nigerian business 
                      owner already uses daily.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white/10 backdrop-blur rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-6">Nigerian Success Stories</h3>
              <div className="space-y-6">
                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                      <span className="font-bold">AO</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">Adebayo Olumide</h4>
                      <p className="text-sm text-green-200">Lagos Wholesale</p>
                    </div>
                  </div>
                  <p className="text-green-100 italic">
                    "Increased my monthly sales by 300% and saved 15 hours per week on customer communication."
                  </p>
                </div>
                
                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                      <span className="font-bold">FN</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">Fatima Nasir</h4>
                      <p className="text-sm text-green-200">Kano Trading Co.</p>
                    </div>
                  </div>
                  <p className="text-green-100 italic">
                    "Now I can reach retailers in 12 states instead of just Kano. My business has never been better!"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Scale
            </h2>
            <p className="text-xl text-gray-600">
              Powerful features designed specifically for wholesale businesses
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Customer Groups</h3>
                <p className="text-gray-600">
                  Organize retailers by location, purchase volume, or product preferences 
                  for targeted marketing.
                </p>
              </CardContent>
            </Card>
            
            <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Inventory Management</h3>
                <p className="text-gray-600">
                  Track stock levels, set low-stock alerts, and never miss a sale 
                  due to inventory issues.
                </p>
              </CardContent>
            </Card>
            
            <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Sales Analytics</h3>
                <p className="text-gray-600">
                  Get detailed insights into your best products, top customers, 
                  and sales trends.
                </p>
              </CardContent>
            </Card>
            
            <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Bulk WhatsApp</h3>
                <p className="text-gray-600">
                  Send product updates, promotions, and stock alerts to hundreds 
                  of retailers instantly.
                </p>
              </CardContent>
            </Card>
            
            <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Secure Payments</h3>
                <p className="text-gray-600">
                  Accept payments through cards, bank transfers, and mobile money 
                  with instant confirmation.
                </p>
              </CardContent>
            </Card>
            
            <Card className="p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Smartphone className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Mobile Optimized</h3>
                <p className="text-gray-600">
                  Manage your business from anywhere with our mobile-first design 
                  that works on any device.
                </p>
              </CardContent>
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
            Join hundreds of Nigerian wholesalers who are already growing their business with Quikpik
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
              Free 30-day trial
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
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-xl">Q</span>
            </div>
            <span className="text-2xl font-bold">Quikpik</span>
          </div>
          
          <div className="text-center text-gray-400">
            <p className="mb-4">
              Empowering Nigerian wholesale businesses to reach more customers and grow faster.
            </p>
            <p>
              © 2025 Quikpik. Built with ❤️ for Nigerian entrepreneurs.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}