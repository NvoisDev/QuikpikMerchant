import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "@/components/ui/logo";
import Footer from "@/components/ui/footer";
import { 
  Package, 
  MessageCircle, 
  CreditCard, 
  BarChart3, 
  Handshake, 
  Users,
  ChevronRight,
  Star
} from "lucide-react";

export default function Landing() {
  const handleGoogleSignIn = () => {
    window.location.href = "/api/login";
  };

  const features = [
    {
      icon: Package,
      title: "Smart Inventory Management",
      description: "Track stock levels, set minimum order quantities, and get real-time stock alerts when inventory runs low.",
      color: "bg-primary/10 text-primary"
    },
    {
      icon: MessageCircle,
      title: "WhatsApp Broadcasting",
      description: "Send product updates and promotions directly to your retail customers via WhatsApp with rich media support.",
      color: "bg-primary/10 text-primary"
    },
    {
      icon: CreditCard,
      title: "Secure Payments",
      description: "Accept payments online with Stripe integration. Automatic invoice generation and transparent transaction fees.",
      color: "bg-primary/10 text-primary"
    },
    {
      icon: BarChart3,
      title: "Advanced Analytics & Advertising",
      description: "Track sales performance with premium analytics. Create advertising campaigns and SEO-optimized product pages.",
      color: "bg-purple-100 text-purple-600"
    },
    {
      icon: Handshake,
      title: "B2B Marketplace Access",
      description: "Join our premium B2B marketplace to reach thousands of retailers and expand your customer base nationwide.",
      color: "bg-green-100 text-green-600"
    },
    {
      icon: Users,
      title: "Team Management & Customer Groups",
      description: "Organize customers into groups and manage team members with role-based permissions and collaborative tools.",
      color: "bg-indigo-100 text-indigo-600"
    }
  ];

  const stats = [
    { value: "500+", label: "Active Wholesalers" },
    { value: "$2.5M+", label: "Platform Revenue" },
    { value: "85%", label: "Average Sales Growth" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Logo size="lg" />
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <a href="#features" className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium">
                Features
              </a>
              <a href="#pricing" className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium">
                Pricing
              </a>
              <a href="#support" className="text-muted-foreground hover:text-foreground px-3 py-2 text-sm font-medium">
                Support
              </a>
              <Button onClick={handleGoogleSignIn}>
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="gradient-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl lg:text-6xl font-bold mb-6">
                Scale Your Wholesale Business with Smart Technology
              </h1>
              <p className="text-xl mb-8 text-blue-100">
                Manage inventory, broadcast to customers, accept payments, and track performance - all in one powerful platform designed for wholesalers.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="bg-white text-primary hover:bg-gray-100 font-semibold"
                  onClick={handleGoogleSignIn}
                >
                  Start Free Trial
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white text-white hover:bg-white hover:text-primary font-semibold"
                >
                  Watch Demo
                </Button>
              </div>
            </div>
            <div className="relative">
              <img 
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600" 
                alt="Business dashboard interface" 
                className="rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
              Everything You Need to Grow
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              From inventory management to customer communication, Quikpik Merchant provides all the tools modern wholesalers need.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-8">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-6 ${feature.color}`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 bg-secondary text-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Trusted by Growing Wholesalers
            </h2>
            <p className="text-xl text-muted-foreground">
              Join hundreds of wholesalers who have transformed their business operations
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {stats.map((stat, index) => (
              <div key={index}>
                <div className="text-4xl font-bold text-accent mb-2">
                  {stat.value}
                </div>
                <div className="text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-6">
            Ready to Transform Your Wholesale Business?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join thousands of wholesalers who have already upgraded their operations with Quikpik Merchant.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={handleGoogleSignIn}>
              Get Started Free
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline">
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
