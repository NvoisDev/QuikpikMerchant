import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  MessageSquare,
  Users,
  Shield,
  CheckCircle,
  Zap,
  CreditCard,
  Package,
  Phone,
  Lock,
  ShoppingBag,
  FileText,
} from "lucide-react";

export default function LandingPage() {
  const handleGetStarted = () => { window.location.href = "/signup"; };
  const handleLogin = () => { window.location.href = "/login"; };
  const handleCustomerLogin = () => { window.location.href = "/customer-login"; };

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold text-primary">Quikpik</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleCustomerLogin} className="hidden sm:inline-flex text-sm text-gray-600">
              Customer Login
            </Button>
            <Button variant="ghost" onClick={handleLogin} className="hidden sm:inline-flex text-sm text-gray-600">
              Wholesaler Login
            </Button>
            <Button onClick={handleGetStarted} className="bg-primary hover:bg-primary/90 text-sm px-4">
              Start Free <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-16 sm:pt-24 pb-16 sm:pb-20 bg-gradient-to-b from-green-50/60 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 text-xs font-semibold px-4 py-2 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            Built for wholesale businesses
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight mb-6">
            Run your wholesale business<br className="hidden sm:block" />
            <span className="text-primary"> without the chaos</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Orders, payments, stock, and customers — all in one simple platform built for modern wholesalers.
            No calls. No spreadsheets. No chasing payments.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="text-base px-8 py-6 bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20"
            >
              Start Free <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleLogin}
              className="text-base px-8 py-6 rounded-xl border-2"
            >
              Log in to your account
            </Button>
          </div>
          <p className="text-sm text-gray-500 mb-10">
            Are you a customer?{" "}
            <button
              onClick={handleCustomerLogin}
              className="text-primary font-medium hover:underline inline-flex items-center gap-1"
            >
              Access your portal <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </p>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" /> No monthly fees to start</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" /> Only pay on card orders</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" /> Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="py-16 sm:py-20 bg-gray-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
            Still running your wholesale business like this?
          </h2>
          <p className="text-gray-400 text-lg mb-12">Sound familiar? You're not alone.</p>

          <div className="grid sm:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
            {[
              { icon: MessageSquare, text: "Taking orders over WhatsApp and writing them down manually" },
              { icon: CreditCard,    text: "Chasing payments long after goods have left the door" },
              { icon: Package,       text: "Managing stock levels in a spreadsheet (that's always out of date)" },
              { icon: Users,         text: "Sending individual price lists to every single customer" },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-4 bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5 text-red-400" />
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          <p className="mt-12 text-gray-400 text-base">
            There's a better way. <span className="text-white font-semibold">Quikpik handles all of it for you.</span>
          </p>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Everything you need to run your wholesale business
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              One platform replaces the calls, the spreadsheets, and the back-and-forth.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: ShoppingBag,
                color: "bg-blue-50 text-blue-600",
                title: "Instant Online Ordering",
                desc: "Customers browse your live catalogue and place orders any time — no calls, no messages, no manual entry.",
              },
              {
                icon: CreditCard,
                color: "bg-green-50 text-green-600",
                title: "Custom Pricing Per Customer",
                desc: "Set different price lists for different customers. Each buyer sees their own personalised rates automatically.",
              },
              {
                icon: FileText,
                color: "bg-purple-50 text-purple-600",
                title: "Quotes → Payment in One Flow",
                desc: "Create a quote, send a payment link, and get paid instantly. No follow-up calls needed.",
              },
              {
                icon: Package,
                color: "bg-orange-50 text-orange-600",
                title: "Real-Time Stock Control",
                desc: "Inventory updates automatically with every order. Low-stock alerts stop you overselling.",
              },
              {
                icon: Lock,
                color: "bg-rose-50 text-rose-600",
                title: "Pay Now or Pay Later",
                desc: "Offer trusted customers the option to buy on account while everyone else pays by card.",
              },
              {
                icon: Phone,
                color: "bg-teal-50 text-teal-600",
                title: "SMS & WhatsApp Ready",
                desc: "Send order confirmations and payment links via SMS and WhatsApp — the channels your customers already use.",
              },
            ].map(({ icon: Icon, color, title, desc }, i) => (
              <Card key={i} className="p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Up and running in minutes
          </h2>
          <p className="text-gray-500 text-lg mb-14">Three steps. No technical setup required.</p>

          <div className="grid sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-8 left-1/4 right-1/4 h-0.5 bg-green-200 z-0"></div>
            {[
              { step: "1", title: "Set up your store", desc: "Add your products, pricing, and delivery options in minutes." },
              { step: "2", title: "Share your link", desc: "Send your store link to customers via WhatsApp, SMS, or email." },
              { step: "3", title: "Receive orders and get paid", desc: "Customers order online. Payments land directly in your account." },
            ].map(({ step, title, desc }, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-primary text-white text-2xl font-extrabold rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-primary/20">
                  {step}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Start free. Only pay when you get paid.
          </h2>
          <p className="text-gray-500 text-lg mb-12">Simple, honest pricing with no surprises.</p>

          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: CheckCircle,
                color: "text-green-500",
                bg: "bg-green-50",
                title: "£0/month to start",
                desc: "Full access on the free plan. No credit card needed.",
              },
              {
                icon: CreditCard,
                color: "text-blue-500",
                bg: "bg-blue-50",
                title: "Small fee on card payments",
                desc: "Only charged when a customer pays by card online.",
              },
              {
                icon: Shield,
                color: "text-purple-500",
                bg: "bg-purple-50",
                title: "Offline orders are 100% yours",
                desc: "Cash, Pay Later, and offline orders have no platform fee.",
              },
            ].map(({ icon: Icon, color, bg, title, desc }, i) => (
              <div key={i} className={`${bg} rounded-2xl p-6 text-left`}>
                <Icon className={`h-8 w-8 ${color} mb-4`} />
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>

          <Button onClick={handleGetStarted} size="lg" className="bg-primary hover:bg-primary/90 text-base px-10 py-6 rounded-xl shadow-lg shadow-primary/20">
            Start Free Today <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-xs text-gray-400 mt-4">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Stop paying for tools that don't work
            </h2>
            <p className="text-gray-500 text-lg">See how Quikpik stacks up against the old way.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 text-sm font-semibold border-b border-gray-100">
              <div className="col-span-1 p-4 text-gray-500"></div>
              <div className="p-4 text-center text-gray-500 border-l border-gray-100">Traditional</div>
              <div className="p-4 text-center text-primary border-l border-gray-100">Quikpik</div>
            </div>
            {[
              { label: "Monthly cost",     old: "£200–£500+",     new: "Free to start" },
              { label: "Taking orders",    old: "Manual",         new: "Automated online" },
              { label: "Payments",         old: "Chasing invoices", new: "Instant card payments" },
              { label: "Stock tracking",   old: "Spreadsheets",   new: "Real-time, automatic" },
              { label: "Customer pricing", old: "Sent manually",  new: "Custom price lists" },
              { label: "Contracts",        old: "Annual lock-in", new: "Cancel anytime" },
            ].map(({ label, old, new: newVal }, i) => (
              <div key={i} className={`grid grid-cols-3 text-sm border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <div className="p-4 font-medium text-gray-700">{label}</div>
                <div className="p-4 text-center text-gray-400 border-l border-gray-100">{old}</div>
                <div className="p-4 text-center text-primary font-semibold border-l border-gray-100 flex items-center justify-center gap-1">
                  <CheckCircle className="h-4 w-4" /> {newVal}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="py-14 sm:py-20 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {[
              { icon: Shield,       color: "text-green-500", title: "Secure payments",          desc: "Powered by Stripe — the same payments infrastructure used by the world's fastest-growing companies." },
              { icon: Zap,          color: "text-blue-500",  title: "Built for wholesalers",    desc: "Designed specifically for B2B wholesale businesses, not generic e-commerce." },
              { icon: CheckCircle,  color: "text-purple-500", title: "Used by growing businesses", desc: "Wholesalers use Quikpik to take orders, manage stock, and get paid — all in one place." },
            ].map(({ icon: Icon, color, title, desc }, i) => (
              <div key={i} className="flex flex-col items-center text-center px-4">
                <Icon className={`h-10 w-10 ${color} mb-4`} />
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 sm:py-28 bg-gradient-to-br from-primary to-green-600 text-white text-center">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 leading-tight">
            Start taking orders today
          </h2>
          <p className="text-green-100 text-lg mb-10">
            Join wholesalers already using Quikpik to run their business smarter.
          </p>
          <Button
            onClick={handleGetStarted}
            size="lg"
            className="bg-white text-primary hover:bg-gray-50 text-base font-semibold px-10 py-6 rounded-xl shadow-xl"
          >
            Start Free <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-green-200 text-sm mt-5">No credit card required · Free plan available · Cancel anytime</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-8 bg-gray-950 text-gray-500 text-center text-sm">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-6 w-6 object-contain" />
            <span className="text-white font-bold">Quikpik</span>
          </div>
          <p>© {new Date().getFullYear()} Quikpik. All rights reserved.</p>
          <div className="flex gap-4">
            <button onClick={handleCustomerLogin} className="hover:text-white transition-colors">Customer Login</button>
            <button onClick={handleLogin} className="hover:text-white transition-colors">Wholesaler Login</button>
            <button onClick={handleGetStarted} className="hover:text-white transition-colors">Sign Up Free</button>
          </div>
        </div>
      </footer>

    </div>
  );
}
