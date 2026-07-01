import { lazy, Suspense, useEffect } from "react";
import "@/lib/impersonation";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import OfflineBanner from "@/components/OfflineBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePresencePing } from "@/hooks/usePresencePing";
import { OnboardingProvider } from "@/components/OnboardingProvider";
import { ImpersonationProvider } from "@/contexts/impersonation-context";
import ErrorBoundary from "@/components/ErrorBoundary";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import ElephantLoader from "@/components/ui/elephant-loader";
import { useVersionCheck } from "@/hooks/useVersionCheck";

const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/Login"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const CustomerLogin = lazy(() => import("@/pages/CustomerLogin"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const WholesalerDashboard = lazy(() => import("@/pages/wholesaler-dashboard"));
const ProductManagement = lazy(() => import("@/pages/product-management"));
const Checkout = lazy(() => import("@/pages/checkout"));
const Settings = lazy(() => import("@/pages/settings"));
const StripeSuccess = lazy(() => import("@/pages/stripe-success"));
const Marketplace = lazy(() => import("@/pages/marketplace"));
const PublicProductPage = lazy(() => import("@/pages/public-product"));
const OrdersFresh = lazy(() => import("@/pages/orders-fresh"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Help = lazy(() => import("@/pages/help"));
const Campaigns = lazy(() => import("@/pages/campaigns"));
const Financials = lazy(() => import("@/pages/financials"));
const FinancialHealth = lazy(() => import("@/pages/financial-health"));
const CampaignPreview = lazy(() => import("@/pages/campaign-preview"));
const ProductOrderPage = lazy(() => import("@/pages/product-order-page"));
const CustomerPortal = lazy(() => import("@/pages/customer-portal"));
const PaymentSuccess = lazy(() => import("@/pages/payment-success"));
const StockAlerts = lazy(() => import("@/pages/stock-alerts"));
const TeamManagement = lazy(() => import("@/pages/team-management"));
const TeamInvitation = lazy(() => import("@/pages/team-invitation"));
const Signup = lazy(() => import("@/pages/signup"));
const SignupComplete = lazy(() => import("@/pages/signup-complete"));
const WholesalerSelection = lazy(() => import("@/pages/WholesalerSelection"));
const AcceptInvitation = lazy(() => import("@/pages/AcceptInvitation"));
const Customers = lazy(() => import("@/pages/customers"));
const CustomerRegistrationRequests = lazy(() => import("@/pages/customer-registration-requests"));
const AuthSuccess = lazy(() => import("@/pages/auth-success"));
const SuperAdmin = lazy(() => import("@/pages/super-admin"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const SubscriptionPricing = lazy(() => import("@/pages/SubscriptionPricing"));
const QuickQuote = lazy(() => import("@/pages/quick-quote"));
const CustomerDetail = lazy(() => import("@/pages/customer-detail"));
const Promotions = lazy(() => import("@/pages/promotions"));
const Integrations = lazy(() => import("@/pages/integrations"));
const OrderDetail = lazy(() => import("@/pages/order-detail"));
const ProductDetail = lazy(() => import("@/pages/product-detail"));
const WelcomePage = lazy(() => import("@/pages/WelcomePage"));
const PublicStorePage = lazy(() => import("@/pages/public-store-page"));
const LeadsPage = lazy(() => import("@/pages/leads"));
const Blog = lazy(() => import("@/pages/blog"));
const BlogPost = lazy(() => import("@/pages/blog-post"));
const PriceListDetail = lazy(() => import("@/pages/price-list-detail"));

import AppLayout from "@/components/layout/app-layout";
import SubscriptionExpiredWall from "@/components/SubscriptionExpiredWall";
import AccountSuspendedWall from "@/components/AccountSuspendedWall";

// ---------------------------------------------------------------------------
// Stable section-wrapped page components
// Defined at module level so their identity is constant across renders, which
// prevents wouter from remounting the page on every parent re-render.
// ---------------------------------------------------------------------------

const MarketplaceSection = () => (
  <SectionErrorBoundary sectionName="Marketplace"><Marketplace /></SectionErrorBoundary>
);
const ProductDetailSection = () => (
  <SectionErrorBoundary sectionName="Product detail"><ProductDetail /></SectionErrorBoundary>
);
const ProductManagementSection = () => (
  <SectionErrorBoundary sectionName="Product management"><ProductManagement /></SectionErrorBoundary>
);
const PromotionsSection = () => (
  <SectionErrorBoundary sectionName="Promotions"><Promotions /></SectionErrorBoundary>
);
const CustomerDetailSection = () => (
  <SectionErrorBoundary sectionName="Customer detail"><CustomerDetail /></SectionErrorBoundary>
);
const CustomersSection = () => (
  <SectionErrorBoundary sectionName="Customers"><Customers /></SectionErrorBoundary>
);
const PriceListDetailSection = () => (
  <SectionErrorBoundary sectionName="Price list detail"><PriceListDetail /></SectionErrorBoundary>
);
const CustomerRegistrationRequestsSection = () => (
  <SectionErrorBoundary sectionName="Customer registration requests"><CustomerRegistrationRequests /></SectionErrorBoundary>
);
const OrderDetailSection = () => (
  <SectionErrorBoundary sectionName="Order detail"><OrderDetail /></SectionErrorBoundary>
);
const OrdersSection = () => (
  <SectionErrorBoundary sectionName="Orders"><OrdersFresh /></SectionErrorBoundary>
);
const AnalyticsSection = () => (
  <SectionErrorBoundary sectionName="Analytics"><Analytics /></SectionErrorBoundary>
);
const FinancialsSection = () => (
  <SectionErrorBoundary sectionName="Financials"><Financials /></SectionErrorBoundary>
);
const FinancialHealthSection = () => (
  <SectionErrorBoundary sectionName="Financial health"><FinancialHealth /></SectionErrorBoundary>
);
const SettingsSection = () => (
  <SectionErrorBoundary sectionName="Settings"><Settings /></SectionErrorBoundary>
);
const CampaignsSection = () => (
  <SectionErrorBoundary sectionName="Campaigns"><Campaigns /></SectionErrorBoundary>
);
const MessageTemplatesSection = () => (
  <SectionErrorBoundary sectionName="Message templates"><Campaigns /></SectionErrorBoundary>
);
const StockAlertsSection = () => (
  <SectionErrorBoundary sectionName="Stock alerts"><StockAlerts /></SectionErrorBoundary>
);
const QuickQuoteSection = () => (
  <SectionErrorBoundary sectionName="Quick quote"><QuickQuote /></SectionErrorBoundary>
);
const TeamManagementSection = () => (
  <SectionErrorBoundary sectionName="Team management"><TeamManagement /></SectionErrorBoundary>
);
const IntegrationsSection = () => (
  <SectionErrorBoundary sectionName="Integrations"><Integrations /></SectionErrorBoundary>
);
const LeadsSection = () => (
  <SectionErrorBoundary sectionName="Leads"><LeadsPage /></SectionErrorBoundary>
);
const CustomerPortalSection = () => (
  <SectionErrorBoundary sectionName="Customer portal"><CustomerPortal /></SectionErrorBoundary>
);
const StorePreviewSection = () => (
  <SectionErrorBoundary sectionName="Store preview"><CustomerPortal /></SectionErrorBoundary>
);
const CheckoutSection = () => (
  <SectionErrorBoundary sectionName="Checkout"><Checkout /></SectionErrorBoundary>
);
const CampaignPreviewSection = () => (
  <SectionErrorBoundary sectionName="Campaign"><CampaignPreview /></SectionErrorBoundary>
);
const ProductOrderSection = () => (
  <SectionErrorBoundary sectionName="Product page"><ProductOrderPage /></SectionErrorBoundary>
);
const PublicProductSection = () => (
  <SectionErrorBoundary sectionName="Product page"><PublicProductPage /></SectionErrorBoundary>
);
const WelcomeSection = () => (
  <SectionErrorBoundary sectionName="Store"><WelcomePage /></SectionErrorBoundary>
);
const BlogSection = () => (
  <SectionErrorBoundary sectionName="Blog"><Blog /></SectionErrorBoundary>
);
const BlogPostSection = () => (
  <SectionErrorBoundary sectionName="Blog post"><BlogPost /></SectionErrorBoundary>
);

// ---------------------------------------------------------------------------

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <ElephantLoader message="Loading..." />
  </div>
);

// Lightweight spinner used inside the authenticated layout so the sidebar
// stays visible while a lazy page chunk is loading
const ContentLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading…</p>
    </div>
  </div>
);

// Redirects /admin to /super-admin using wouter navigation
function AdminRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/super-admin", { replace: true });
  }, [setLocation]);
  return null;
}

// Component for public routes that don't need authentication
function PublicRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/campaign/:id" component={CampaignPreviewSection} />
        <Route path="/marketplace/product/:id" component={ProductOrderSection} />
        <Route path="/product/:slug" component={PublicProductSection} />
        <Route path="/customer/payment-success" component={PaymentSuccess} />
        <Route path="/customer/:id" component={({ params }) => { const [, setLocation] = useLocation(); useEffect(() => { setLocation(`/welcome/${params.id}`, { replace: true }); }, [params.id]); return null; }} />
        <Route path="/welcome/:wholesalerId" component={WelcomeSection} />
        <Route path="/customer/:wholesalerId/:customerPhone" component={CustomerPortalSection} />
        <Route path="/store/:id" component={CustomerPortalSection} />
        <Route path="/team-invitation" component={TeamInvitation} />
        <Route path="/signup" component={Signup} />
        <Route path="/signup-complete" component={SignupComplete} />
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/customer-login" component={CustomerLogin} />
        <Route path="/auth-success" component={AuthSuccess} />
        <Route path="/select-wholesaler" component={WholesalerSelection} />
        <Route path="/accept-invitation/:token" component={({params}) => <AcceptInvitation token={params.token} />} />
        <Route path="/blog/:slug" component={BlogPostSection} />
        <Route path="/blog" component={BlogSection} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/admin" component={AdminRedirect} />
        <Route path="/super-admin" component={SuperAdmin} />
        <Route path="/w/:slug" component={PublicStorePage} />
        <Route path="/" component={LandingPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// Component for authenticated routes that need authentication
function AuthenticatedRoutes() {
  const { user, isLoading, isAuthenticated } = useAuth();

  usePresencePing(isAuthenticated);

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <AccountSuspendedWall>
    <SubscriptionExpiredWall>
    <AppLayout>
      <Suspense fallback={<ContentLoader />}>
        <Switch>
          <Route path="/marketplace" component={MarketplaceSection} />
          {/* Preview store is accessible to wholesalers, team members, and super-admins */}
          <Route path="/preview-store" component={StorePreviewSection} />
          <Route path="/preview-store/:id" component={StorePreviewSection} />
          {user && (user.role === 'wholesaler' || user.role === 'team_member') ? (
            <>
              <Route path="/" component={user?.role === 'team_member' ? OrdersSection : WholesalerDashboard} />
              <Route path="/dashboard" component={WholesalerDashboard} />
              <Route path="/products/:id" component={ProductDetailSection} />
              <Route path="/products" component={ProductManagementSection} />
              <Route path="/promotions" component={PromotionsSection} />
              <Route path="/price-lists/:id" component={PriceListDetailSection} />
              <Route path="/customers/:customerId" component={CustomerDetailSection} />
              <Route path="/customers" component={CustomersSection} />
              <Route path="/customer-registration-requests" component={CustomerRegistrationRequestsSection} />
              <Route path="/orders/:id" component={OrderDetailSection} />
              <Route path="/orders" component={OrdersSection} />
              <Route path="/analytics" component={AnalyticsSection} />
              <Route path="/financials" component={FinancialsSection} />
              <Route path="/financial-health" component={FinancialHealthSection} />
              <Route path="/settings" component={SettingsSection} />
              <Route path="/stripe-success" component={StripeSuccess} />
              <Route path="/campaigns" component={CampaignsSection} />
              <Route path="/broadcasts" component={CampaignsSection} />
              <Route path="/message-templates" component={MessageTemplatesSection} />
              <Route path="/stock-alerts" component={StockAlertsSection} />
              <Route path="/quick-quote" component={QuickQuoteSection} />
              <Route path="/team-management" component={TeamManagementSection} />
              <Route path="/help" component={Help} />
              <Route path="/subscription-pricing" component={SubscriptionPricing} />
              <Route path="/integrations" component={IntegrationsSection} />
              <Route path="/leads" component={LeadsSection} />
            </>
          ) : (
            <>
              <Route path="/checkout" component={CheckoutSection} />
            </>
          )}
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
    </SubscriptionExpiredWall>
    </AccountSuspendedWall>
  );
}

function Router() {
  const [location] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  
  // SECURITY: Block customers from accessing wholesaler dashboard
  if (user && (user.role === 'customer' || user.role === 'retailer')) {
    window.location.href = '/customer-login';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Redirecting...</h2>
          <p className="text-gray-600">Customers cannot access the wholesaler dashboard.</p>
        </div>
      </div>
    );
  }
  
  const publicRoutes = ['/login', '/customer-login', '/signup', '/signup-complete', '/auth-success', '/team-invitation', '/forgot-password', '/reset-password', '/super-admin', '/terms', '/privacy'];
  const isPublicRoute = location.startsWith('/campaign/') || 
    location.startsWith('/marketplace/product/') || 
    location.startsWith('/customer/') || 
    location.startsWith('/store/') ||
    location.startsWith('/welcome/') ||
    location.startsWith('/w/') ||
    location.startsWith('/blog') ||
    location.startsWith('/product/') ||
    location.startsWith('/accept-invitation/') ||
    location.startsWith('/select-wholesaler') ||
    publicRoutes.includes(location);

  if (isLoading) {
    return <PageLoader />;
  }
  
  if (location === '/') {
    if (isAuthenticated) {
      return <AuthenticatedRoutes />;
    } else {
      return <PublicRoutes />;
    }
  }
  
  if (isPublicRoute) {
    return <PublicRoutes />;
  } else {
    return <AuthenticatedRoutes />;
  }
}

function UpdateBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white text-sm flex items-center justify-between px-4 py-2 shadow-md">
      <span>A new version of Quikpik is ready.</span>
      <button
        onClick={onRefresh}
        className="ml-4 bg-white text-green-700 font-semibold text-xs px-3 py-1 rounded hover:bg-green-50 transition-colors"
      >
        Refresh now
      </button>
    </div>
  );
}

function AppInner() {
  const updateAvailable = useVersionCheck();
  return (
    <>
      {updateAvailable && <UpdateBanner onRefresh={() => window.location.reload()} />}
      <OfflineBanner />
      <Router />
      <Toaster />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ImpersonationProvider>
          <TooltipProvider>
            <OnboardingProvider>
              <AppInner />
            </OnboardingProvider>
          </TooltipProvider>
        </ImpersonationProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
