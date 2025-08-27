import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
  showMascot?: boolean;
}

export function LoadingSpinner({ 
  className, 
  size = 'md', 
  message = 'Loading...',
  showMascot = true 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  const mascotSizes = {
    sm: 'w-16 h-16',
    md: 'w-20 h-20',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32'
  };

  return (
    <div className={cn("flex flex-col items-center justify-center space-y-4", className)}>
      {showMascot && (
        <div className="relative">
          {/* Wholesale Mascot - Friendly delivery character */}
          <div className={cn("relative animate-bounce", mascotSizes[size])}>
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full"
              style={{ animationDuration: '2s' }}
            >
              {/* Background circle */}
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="#10B981"
                className="opacity-10"
              />
              
              {/* Mascot body */}
              <ellipse
                cx="60"
                cy="75"
                rx="35"
                ry="30"
                fill="#059669"
                className="animate-pulse"
                style={{ animationDuration: '3s' }}
              />
              
              {/* Mascot head */}
              <circle
                cx="60"
                cy="45"
                r="25"
                fill="#10B981"
              />
              
              {/* Eyes */}
              <circle cx="52" cy="40" r="3" fill="#FFFFFF" />
              <circle cx="68" cy="40" r="3" fill="#FFFFFF" />
              <circle cx="52" cy="40" r="1.5" fill="#1F2937" />
              <circle cx="68" cy="40" r="1.5" fill="#1F2937" />
              
              {/* Smile */}
              <path
                d="M 50 52 Q 60 58 70 52"
                stroke="#FFFFFF"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              
              {/* Arms holding packages */}
              <ellipse
                cx="35"
                cy="65"
                rx="8"
                ry="15"
                fill="#059669"
                transform="rotate(-20 35 65)"
              />
              <ellipse
                cx="85"
                cy="65"
                rx="8"
                ry="15"
                fill="#059669"
                transform="rotate(20 85 65)"
              />
              
              {/* Package boxes */}
              <rect
                x="25"
                y="55"
                width="12"
                height="12"
                fill="#F59E0B"
                rx="2"
                className="animate-pulse"
                style={{ animationDuration: '2.5s' }}
              />
              <rect
                x="83"
                y="55"
                width="12"
                height="12"
                fill="#EF4444"
                rx="2"
                className="animate-pulse"
                style={{ animationDuration: '2.8s' }}
              />
              
              {/* Package details */}
              <line x1="29" y1="59" x2="33" y2="59" stroke="#FFFFFF" strokeWidth="1" />
              <line x1="29" y1="63" x2="33" y2="63" stroke="#FFFFFF" strokeWidth="1" />
              <line x1="87" y1="59" x2="91" y2="59" stroke="#FFFFFF" strokeWidth="1" />
              <line x1="87" y1="63" x2="91" y2="63" stroke="#FFFFFF" strokeWidth="1" />
              
              {/* Legs */}
              <ellipse
                cx="50"
                cy="95"
                rx="6"
                ry="12"
                fill="#059669"
              />
              <ellipse
                cx="70"
                cy="95"
                rx="6"
                ry="12"
                fill="#059669"
              />
              
              {/* Hat (wholesaler cap) */}
              <ellipse
                cx="60"
                cy="28"
                rx="18"
                ry="8"
                fill="#1F2937"
              />
              <ellipse
                cx="60"
                cy="25"
                rx="15"
                ry="6"
                fill="#374151"
              />
              
              {/* Rotating loading elements around mascot */}
              <g className="animate-spin" style={{ transformOrigin: '60px 60px', animationDuration: '3s' }}>
                <circle cx="60" cy="20" r="2" fill="#10B981" opacity="0.8" />
                <circle cx="95" cy="40" r="2" fill="#F59E0B" opacity="0.8" />
                <circle cx="90" cy="80" r="2" fill="#EF4444" opacity="0.8" />
                <circle cx="60" cy="100" r="2" fill="#8B5CF6" opacity="0.8" />
                <circle cx="30" cy="80" r="2" fill="#06B6D4" opacity="0.8" />
                <circle cx="25" cy="40" r="2" fill="#F97316" opacity="0.8" />
              </g>
            </svg>
          </div>
          
          {/* Spinning loading ring */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn(
              "border-4 border-gray-200 border-t-green-600 rounded-full animate-spin",
              sizeClasses[size]
            )}>
            </div>
          </div>
        </div>
      )}
      
      {!showMascot && (
        <div className={cn(
          "border-4 border-gray-200 border-t-green-600 rounded-full animate-spin",
          sizeClasses[size]
        )}>
        </div>
      )}
      
      {message && (
        <div className="text-center">
          <p className="text-gray-600 font-medium animate-pulse">
            {message}
          </p>
          <div className="flex justify-center space-x-1 mt-2">
            <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Full-screen loading overlay component
export function LoadingOverlay({ message = 'Loading your wholesale platform...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center">
      <LoadingSpinner size="xl" message={message} showMascot={true} />
    </div>
  );
}

// Inline loading state for smaller components
export function InlineLoader({ message = 'Loading...', size = 'sm' as const }) {
  return (
    <div className="flex items-center justify-center p-8">
      <LoadingSpinner size={size} message={message} showMascot={false} />
    </div>
  );
}

// Loading state for cards and sections
export function CardLoader({ message = 'Loading...', className }: { message?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-6", className)}>
      <LoadingSpinner size="lg" message={message} showMascot={true} />
    </div>
  );
}