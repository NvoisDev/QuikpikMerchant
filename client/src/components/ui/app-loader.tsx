import React from 'react';
import { motion } from 'framer-motion';
import LoadingMascot from './loading-mascot';

interface AppLoaderProps {
  message?: string;
  progress?: number;
  showProgress?: boolean;
  className?: string;
}

const AppLoader: React.FC<AppLoaderProps> = ({
  message = "Starting Quikpik...",
  progress = 0,
  showProgress = false,
  className = ''
}) => {
  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50 ${className}`}>
      {/* Background Animation */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-1/4 -left-1/4 w-96 h-96 rounded-full bg-gradient-to-r from-green-200/30 to-emerald-200/30"
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 360],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ 
            duration: 20, 
            repeat: Infinity, 
            ease: "linear"
          }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 w-80 h-80 rounded-full bg-gradient-to-r from-teal-200/30 to-green-200/30"
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [360, 0],
            opacity: [0.5, 0.3, 0.5]
          }}
          transition={{ 
            duration: 15, 
            repeat: Infinity, 
            ease: "linear"
          }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 text-center space-y-8">
        {/* Logo and Brand */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-4"
        >
          <div className="text-4xl font-bold text-gray-800">
            <span className="text-green-600">Quik</span>
            <span className="text-emerald-600">pik</span>
          </div>
          <p className="text-gray-600 text-lg">Wholesale Platform</p>
        </motion.div>

        {/* Animated Mascot */}
        <LoadingMascot 
          size="lg" 
          message={message}
          variant="default"
        />

        {/* Progress Bar */}
        {showProgress && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "100%" }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="w-80 max-w-md"
          >
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-600"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">{progress}% Complete</p>
          </motion.div>
        )}

        {/* Loading Animation */}
        <div className="flex justify-center space-x-1">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="w-2 h-8 bg-gradient-to-t from-green-400 to-emerald-600 rounded-full"
              animate={{
                scaleY: [1, 0.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.1,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>

        {/* Loading Tips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="max-w-md"
        >
          <p className="text-sm text-gray-500">
            Setting up your wholesale dashboard...
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default AppLoader;