import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Wifi, Database, Server, CreditCard, Package, Users, Settings, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { Button } from './button';

interface WhimsicalErrorProps {
  type?: 'network' | 'database' | 'server' | 'payment' | 'notfound' | 'permission' | 'config' | 'generic';
  title?: string;
  message?: string;
  showRetry?: boolean;
  showHome?: boolean;
  onRetry?: () => void;
  onHome?: () => void;
  className?: string;
}

const errorConfigs = {
  network: {
    title: "Connection Lost",
    message: "Looks like we can't reach our servers right now. Check your internet connection and try again.",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    icon: Wifi,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 rounded-full bg-orange-100 border-4 border-orange-200"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div
          className="absolute inset-4 rounded-full bg-orange-200 border-2 border-orange-300"
          animate={{ scale: [1, 0.9, 1] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Wifi className="w-12 h-12 text-orange-500" />
        </div>
        <motion.div
          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          <span className="text-white text-xs font-bold">!</span>
        </motion.div>
      </div>
    )
  },
  database: {
    title: "Database Hiccup",
    message: "Our data warehouse is taking a little break. We're working to get things back on track.",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: Database,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotateY: [0, 360] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Database className="w-16 h-16 text-blue-500" />
        </motion.div>
        <motion.div
          className="absolute top-2 right-2 w-4 h-4"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          <div className="w-full h-full bg-red-500 rounded-full" />
        </motion.div>
      </div>
    )
  },
  server: {
    title: "Server Taking a Nap",
    message: "Our servers are having a power nap. They'll be back up and running shortly!",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    icon: Server,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Server className="w-16 h-16 text-purple-500" />
        </motion.div>
        <motion.div
          className="absolute -top-4 left-1/2 transform -translate-x-1/2"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-purple-400 rounded-full" />
            <div className="w-2 h-2 bg-purple-400 rounded-full" />
            <div className="w-2 h-2 bg-purple-400 rounded-full" />
          </div>
        </motion.div>
      </div>
    )
  },
  payment: {
    title: "Payment Oops",
    message: "Something went wrong with the payment process. Don't worry, no charges were made.",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: CreditCard,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: [-5, 5, -5] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          <CreditCard className="w-16 h-16 text-red-500" />
        </motion.div>
        <motion.div
          className="absolute top-0 right-0 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        >
          <span className="text-white text-lg font-bold">✕</span>
        </motion.div>
      </div>
    )
  },
  notfound: {
    title: "Page Gone Exploring",
    message: "This page packed its bags and went on an adventure. Let's help you find what you're looking for.",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    icon: Package,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ x: [0, 20, -20, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Package className="w-16 h-16 text-gray-500" />
        </motion.div>
        <motion.div
          className="absolute -bottom-2 left-1/2 transform -translate-x-1/2"
          animate={{ scaleX: [1, 1.2, 0.8, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <div className="w-20 h-2 bg-gray-300 rounded-full opacity-50" />
        </motion.div>
      </div>
    )
  },
  permission: {
    title: "Access Denied",
    message: "You don't have permission to access this area. Contact your administrator if you think this is a mistake.",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    icon: Users,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ scale: [1, 0.95, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="relative">
            <Users className="w-16 h-16 text-yellow-500" />
            <motion.div
              className="absolute -inset-2 border-4 border-yellow-400 rounded-full"
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </motion.div>
        <div className="absolute top-0 right-0 w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
          <span className="text-white text-lg font-bold">🔒</span>
        </div>
      </div>
    )
  },
  config: {
    title: "Configuration Issue",
    message: "There's a configuration problem that needs attention. Please check your settings or contact support.",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    icon: Settings,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: [0, 180, 360] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Settings className="w-16 h-16 text-indigo-500" />
        </motion.div>
        <motion.div
          className="absolute top-2 right-2 w-4 h-4 bg-orange-500 rounded-full"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    )
  },
  generic: {
    title: "Something Went Wrong",
    message: "We encountered an unexpected issue. Our team has been notified and is working on a fix.",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    icon: AlertTriangle,
    illustration: (
      <div className="relative w-32 h-32 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="relative">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-12 h-12 text-gray-500" />
            </div>
            <motion.div
              className="absolute -top-1 -right-1 w-6 h-6"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="w-full h-full bg-yellow-400 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">!</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    )
  }
};

export const WhimsicalError: React.FC<WhimsicalErrorProps> = ({
  type = 'generic',
  title,
  message,
  showRetry = true,
  showHome = true,
  onRetry,
  onHome,
  className = ''
}) => {
  const config = errorConfigs[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`
        flex flex-col items-center justify-center min-h-[400px] p-8 rounded-lg
        ${config.bgColor} ${config.borderColor} border-2
        ${className}
      `}
    >
      {/* Whimsical Illustration */}
      {config.illustration}

      {/* Error Content */}
      <div className="text-center max-w-md">
        <h2 className={`text-2xl font-bold mb-3 ${config.color}`}>
          {title || config.title}
        </h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          {message || config.message}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {showRetry && onRetry && (
            <Button
              onClick={onRetry}
              className={`
                px-6 py-2 rounded-lg font-medium transition-all duration-200
                bg-white hover:bg-gray-50 border-2 ${config.borderColor}
                ${config.color} hover:shadow-md
              `}
              variant="outline"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}
          
          {showHome && onHome && (
            <Button
              onClick={onHome}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200 hover:shadow-md"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          )}
        </div>
      </div>

      {/* Floating Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-10 left-10 w-3 h-3 bg-blue-300 rounded-full opacity-60"
          animate={{ y: [0, -20, 0], opacity: [0.6, 0.3, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, delay: 0 }}
        />
        <motion.div
          className="absolute top-20 right-16 w-2 h-2 bg-purple-300 rounded-full opacity-60"
          animate={{ y: [0, -15, 0], opacity: [0.6, 0.3, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, delay: 1 }}
        />
        <motion.div
          className="absolute bottom-16 left-20 w-4 h-4 bg-green-300 rounded-full opacity-60"
          animate={{ y: [0, -25, 0], opacity: [0.6, 0.3, 0.6] }}
          transition={{ duration: 3.5, repeat: Infinity, delay: 2 }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-2 h-2 bg-yellow-300 rounded-full opacity-60"
          animate={{ y: [0, -18, 0], opacity: [0.6, 0.3, 0.6] }}
          transition={{ duration: 4.5, repeat: Infinity, delay: 0.5 }}
        />
      </div>
    </motion.div>
  );
};

// Convenience components for common error types
export const NetworkError: React.FC<Partial<WhimsicalErrorProps>> = (props) => (
  <WhimsicalError type="network" {...props} />
);

export const DatabaseError: React.FC<Partial<WhimsicalErrorProps>> = (props) => (
  <WhimsicalError type="database" {...props} />
);

export const PaymentError: React.FC<Partial<WhimsicalErrorProps>> = (props) => (
  <WhimsicalError type="payment" {...props} />
);

export const NotFoundError: React.FC<Partial<WhimsicalErrorProps>> = (props) => (
  <WhimsicalError type="notfound" {...props} />
);

export const PermissionError: React.FC<Partial<WhimsicalErrorProps>> = (props) => (
  <WhimsicalError type="permission" {...props} />
);

export default WhimsicalError;