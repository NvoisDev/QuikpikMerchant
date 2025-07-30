import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Package, CheckCircle, Truck } from 'lucide-react';

interface ButtonLoaderProps {
  isLoading: boolean;
  variant?: 'default' | 'success' | 'processing' | 'shipping';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}

const ButtonLoader: React.FC<ButtonLoaderProps> = ({
  isLoading,
  variant = 'default',
  size = 'md',
  children,
  className = '',
  disabled = false,
  onClick
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  const getIcon = () => {
    if (!isLoading) return null;
    
    switch (variant) {
      case 'success':
        return <CheckCircle className="w-4 h-4" />;
      case 'processing':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Package className="w-4 h-4" />
          </motion.div>
        );
      case 'shipping':
        return (
          <motion.div
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Truck className="w-4 h-4" />
          </motion.div>
        );
      default:
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="w-4 h-4" />
          </motion.div>
        );
    }
  };

  const getVariantStyles = () => {
    const baseStyles = "relative font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";
    
    switch (variant) {
      case 'success':
        return `${baseStyles} bg-green-600 hover:bg-green-700 text-white focus:ring-green-500`;
      case 'processing':
        return `${baseStyles} bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500`;
      case 'shipping':
        return `${baseStyles} bg-teal-600 hover:bg-teal-700 text-white focus:ring-teal-500`;
      default:
        return `${baseStyles} bg-green-600 hover:bg-green-700 text-white focus:ring-green-500`;
    }
  };

  return (
    <motion.button
      className={`${getVariantStyles()} ${sizeClasses[size]} ${className} ${
        (isLoading || disabled) ? 'opacity-75 cursor-not-allowed' : ''
      }`}
      disabled={isLoading || disabled}
      onClick={onClick}
      whileHover={!isLoading && !disabled ? { scale: 1.02 } : {}}
      whileTap={!isLoading && !disabled ? { scale: 0.98 } : {}}
      transition={{ duration: 0.1 }}
    >
      <div className="flex items-center justify-center gap-2">
        {getIcon()}
        
        <motion.span
          animate={{ 
            opacity: isLoading ? 0.7 : 1,
            x: isLoading ? 4 : 0
          }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.span>
      </div>
      
      {/* Loading overlay effect */}
      {isLoading && (
        <motion.div
          className="absolute inset-0 bg-white/10 rounded-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.button>
  );
};

export default ButtonLoader;