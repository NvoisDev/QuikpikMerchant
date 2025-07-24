import React from 'react';
import { motion } from 'framer-motion';
import LoadingMascot from './loading-mascot';

interface LoadingSkeletonProps {
  variant?: 'card' | 'table' | 'page' | 'form';
  count?: number;
  showMascot?: boolean;
  mascotMessage?: string;
  className?: string;
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'card',
  count = 3,
  showMascot = true,
  mascotMessage = 'Loading content...',
  className = ''
}) => {
  const shimmer = {
    initial: { opacity: 0.3 },
    animate: { opacity: [0.3, 0.7, 0.3] },
    transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
  };

  const CardSkeleton = () => (
    <motion.div 
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" {...shimmer} />
      <motion.div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" {...shimmer} />
      <motion.div className="space-y-2">
        <motion.div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full" {...shimmer} />
        <motion.div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-5/6" {...shimmer} />
      </motion.div>
      <div className="flex justify-between pt-2">
        <motion.div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20" {...shimmer} />
        <motion.div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16" {...shimmer} />
      </div>
    </motion.div>
  );

  const TableSkeleton = () => (
    <motion.div 
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Table Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => (
            <motion.div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1" {...shimmer} />
          ))}
        </div>
      </div>
      
      {/* Table Rows */}
      {[...Array(count)].map((_, rowIndex) => (
        <div key={rowIndex} className="p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
          <div className="flex gap-4">
            {[...Array(4)].map((_, colIndex) => (
              <motion.div 
                key={colIndex} 
                className="h-3 bg-gray-200 dark:bg-gray-700 rounded flex-1" 
                {...shimmer}
                transition={{ ...shimmer.transition, delay: (rowIndex * 4 + colIndex) * 0.1 }}
              />
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );

  const FormSkeleton = () => (
    <motion.div 
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {[...Array(count)].map((_, i) => (
        <div key={i} className="space-y-2">
          <motion.div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" {...shimmer} />
          <motion.div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full" {...shimmer} />
        </div>
      ))}
      
      <div className="flex gap-3 pt-4">
        <motion.div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24" {...shimmer} />
        <motion.div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-20" {...shimmer} />
      </div>
    </motion.div>
  );

  const PageSkeleton = () => (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="space-y-2">
        <motion.div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" {...shimmer} />
        <motion.div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" {...shimmer} />
      </div>
      
      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(count)].map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </motion.div>
  );

  const renderSkeleton = () => {
    switch (variant) {
      case 'table':
        return <TableSkeleton />;
      case 'form':
        return <FormSkeleton />;
      case 'page':
        return <PageSkeleton />;
      default:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(count)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        );
    }
  };

  return (
    <div className={`space-y-8 ${className}`}>
      {showMascot && (
        <div className="flex justify-center py-8">
          <LoadingMascot 
            size="md" 
            message={mascotMessage}
            variant="processing"
          />
        </div>
      )}
      
      {renderSkeleton()}
    </div>
  );
};

export default LoadingSkeleton;