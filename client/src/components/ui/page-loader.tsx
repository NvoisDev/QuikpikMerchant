import React from 'react';
import { motion } from 'framer-motion';
import LoadingMascot from './loading-mascot';

interface PageLoaderProps {
  message?: string;
  variant?: 'default' | 'success' | 'processing' | 'shipping';
  fullScreen?: boolean;
  overlay?: boolean;
  className?: string;
}

const PageLoader: React.FC<PageLoaderProps> = ({
  message = 'Loading your dashboard...',
  variant = 'default',
  fullScreen = false,
  overlay = false,
  className = ''
}) => {
  const baseClasses = 'flex flex-col items-center justify-center';
  const sizeClasses = fullScreen 
    ? 'fixed inset-0 z-50' 
    : 'min-h-[400px] w-full';
  
  const backgroundClasses = overlay 
    ? 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm'
    : 'bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800';

  return (
    <motion.div
      className={`${baseClasses} ${sizeClasses} ${backgroundClasses} ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full">
          <motion.div
            className="w-96 h-96 rounded-full bg-gradient-to-r from-green-200/20 to-emerald-200/20"
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 180, 360]
            }}
            transition={{ 
              duration: 20, 
              repeat: Infinity, 
              ease: "linear"
            }}
          />
        </div>
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full">
          <motion.div
            className="w-80 h-80 rounded-full bg-gradient-to-r from-teal-200/20 to-green-200/20"
            animate={{ 
              scale: [1.2, 1, 1.2],
              rotate: [360, 180, 0]
            }}
            transition={{ 
              duration: 15, 
              repeat: Infinity, 
              ease: "linear"
            }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 text-center space-y-6">
        <LoadingMascot 
          size="lg" 
          message={message}
          variant={variant}
        />
        
        {/* Progress Bar */}
        <div className="w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-600"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "easeInOut",
              repeatType: "reverse"
            }}
          />
        </div>
        
        {/* Loading Tips */}
        <motion.div
          className="max-w-md mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {getLoadingTip(variant)}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};

const getLoadingTip = (variant: 'default' | 'success' | 'processing' | 'shipping'): string => {
  const tips = {
    default: [
      "Preparing your wholesale dashboard...",
      "Organizing your product inventory...",
      "Setting up your business tools..."
    ],
    success: [
      "Great! Everything is ready!",
      "Your changes have been saved successfully!",
      "Welcome back to your dashboard!"
    ],
    processing: [
      "Processing your request...",
      "Updating your product catalog...",
      "Syncing your latest changes..."
    ],
    shipping: [
      "Calculating shipping options...",
      "Finding the best delivery routes...",
      "Preparing your logistics dashboard..."
    ]
  };

  const variantTips = tips[variant as keyof typeof tips] || tips.default;
  return variantTips[Math.floor(Math.random() * variantTips.length)];
};

export default PageLoader;