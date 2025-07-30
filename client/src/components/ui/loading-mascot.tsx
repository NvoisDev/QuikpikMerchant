import React from 'react';
import { motion } from 'framer-motion';
import { Package, Truck, ShoppingCart, Star } from 'lucide-react';

interface LoadingMascotProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  variant?: 'default' | 'success' | 'processing' | 'shipping';
  className?: string;
}

const MascotSVG = ({ size = 'md', variant = 'default' }: { size: 'sm' | 'md' | 'lg'; variant: 'default' | 'success' | 'processing' | 'shipping' }) => {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20', 
    lg: 'w-32 h-32'
  };

  const colors = {
    default: { primary: '#22c55e', secondary: '#4ade80', accent: '#fbbf24' },
    success: { primary: '#16a34a', secondary: '#22c55e', accent: '#eab308' },
    processing: { primary: '#059669', secondary: '#10b981', accent: '#f59e0b' },
    shipping: { primary: '#0d9488', secondary: '#14b8a6', accent: '#22c55e' }
  };

  const color = colors[variant as keyof typeof colors];

  return (
    <motion.div 
      className={`${sizeClasses[size]} relative`}
      animate={{ 
        rotate: variant === 'processing' ? [0, 5, -5, 0] : 0,
        scale: [1, 1.05, 1]
      }}
      transition={{ 
        rotate: { duration: 2, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
      }}
    >
      {/* Mascot Body */}
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Shadow */}
        <ellipse cx="50" cy="90" rx="25" ry="8" fill="rgba(0,0,0,0.1)" />
        
        {/* Body */}
        <motion.ellipse 
          cx="50" cy="60" rx="20" ry="25" 
          fill={color.primary}
          animate={{ scaleY: [1, 1.1, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Belly */}
        <ellipse cx="50" cy="65" rx="12" ry="15" fill={color.secondary} />
        
        {/* Head */}
        <motion.circle 
          cx="50" cy="35" r="18" 
          fill={color.primary}
          animate={{ rotate: variant === 'shipping' ? [0, 10, -10, 0] : 0 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Face */}
        <circle cx="44" cy="30" r="2" fill="#1F2937" />
        <circle cx="56" cy="30" r="2" fill="#1F2937" />
        
        {/* Smile */}
        <motion.path 
          d="M 42 38 Q 50 45 58 38" 
          stroke="#1F2937" 
          strokeWidth="2" 
          fill="none"
          animate={{ d: variant === 'success' ? ["M 42 38 Q 50 45 58 38", "M 42 35 Q 50 42 58 35"] : "M 42 38 Q 50 45 58 38" }}
          transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
        />
        
        {/* Arms */}
        <motion.ellipse 
          cx="30" cy="50" rx="8" ry="4" 
          fill={color.primary}
          animate={{ 
            rotate: variant === 'processing' ? [0, 20, -20, 0] : [0, 10, -10, 0],
            x: variant === 'shipping' ? [0, 2, -2, 0] : 0
          }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.ellipse 
          cx="70" cy="50" rx="8" ry="4" 
          fill={color.primary}
          animate={{ 
            rotate: variant === 'processing' ? [0, -20, 20, 0] : [0, -10, 10, 0],
            x: variant === 'shipping' ? [0, -2, 2, 0] : 0
          }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Hat/Cap */}
        <motion.ellipse 
          cx="50" cy="20" rx="15" ry="6" 
          fill={color.accent}
          animate={{ scaleX: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <ellipse cx="50" cy="18" rx="12" ry="4" fill={color.accent} />
        
        {/* Feet */}
        <ellipse cx="42" cy="82" rx="6" ry="4" fill={color.secondary} />
        <ellipse cx="58" cy="82" rx="6" ry="4" fill={color.secondary} />
      </svg>
      
      {/* Floating particles around mascot */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      >
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-green-400 rounded-full"
            style={{
              left: `${30 + i * 20}%`,
              top: `${20 + i * 15}%`,
            }}
            animate={{
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.6,
              ease: "easeInOut"
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
};

const LoadingMascot: React.FC<LoadingMascotProps> = ({ 
  size = 'md', 
  message = 'Loading...', 
  variant = 'default',
  className = ''
}) => {
  const containerClasses = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4'
  };

  const textClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const getVariantIcon = () => {
    switch (variant) {
      case 'success':
        return <Star className="w-4 h-4 text-green-600" />;
      case 'processing':
        return <Package className="w-4 h-4 text-emerald-600" />;
      case 'shipping':
        return <Truck className="w-4 h-4 text-teal-600" />;
      default:
        return <ShoppingCart className="w-4 h-4 text-green-500" />;
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center ${containerClasses[size]} ${className}`}>
      <MascotSVG size={size} variant={variant} />
      
      <div className="flex items-center gap-2">
        {getVariantIcon()}
        <motion.p 
          className={`${textClasses[size]} font-medium text-gray-600 dark:text-gray-300`}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {message}
        </motion.p>
      </div>
      
      {/* Loading dots */}
      <div className="flex gap-1">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-green-500 rounded-full"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default LoadingMascot;