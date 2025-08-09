import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  velocity: {
    x: number;
    y: number;
    rotation: number;
  };
}

interface ConfettiAnimationProps {
  isActive: boolean;
  duration?: number;
  intensity?: 'light' | 'medium' | 'heavy';
  colors?: string[];
  onComplete?: () => void;
}

const defaultColors = [
  '#10b981', // Primary green
  '#059669', // Dark green
  '#34d399', // Light green
  '#f59e0b', // Orange
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#f97316', // Orange-red
  '#06b6d4', // Cyan
  '#84cc16', // Lime
];

export const ConfettiAnimation: React.FC<ConfettiAnimationProps> = ({
  isActive,
  duration = 3000,
  intensity = 'medium',
  colors = defaultColors,
  onComplete
}) => {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  const intensityConfig = {
    light: { count: 30, spread: 60, velocity: 3 },
    medium: { count: 50, spread: 80, velocity: 4 },
    heavy: { count: 80, spread: 100, velocity: 5 }
  };

  const config = intensityConfig[intensity];

  const createConfettiPiece = (index: number): ConfettiPiece => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight * 0.3; // Start from top third of screen

    return {
      id: index,
      x: centerX + (Math.random() - 0.5) * config.spread,
      y: centerY,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4, // 4-12px
      rotation: Math.random() * 360,
      velocity: {
        x: (Math.random() - 0.5) * config.velocity * 2,
        y: Math.random() * config.velocity + 2,
        rotation: (Math.random() - 0.5) * 10
      }
    };
  };

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      
      // Create initial confetti burst
      const initialConfetti = Array.from({ length: config.count }, (_, i) => 
        createConfettiPiece(i)
      );
      setConfetti(initialConfetti);

      // Animate confetti falling
      const animationInterval = setInterval(() => {
        setConfetti(prev => 
          prev.map(piece => ({
            ...piece,
            x: piece.x + piece.velocity.x,
            y: piece.y + piece.velocity.y,
            rotation: piece.rotation + piece.velocity.rotation,
            velocity: {
              ...piece.velocity,
              y: piece.velocity.y + 0.3, // Gravity
              x: piece.velocity.x * 0.99 // Air resistance
            }
          })).filter(piece => piece.y < window.innerHeight + 50) // Remove pieces that fall off screen
        );
      }, 50);

      // Clean up after duration
      const cleanup = setTimeout(() => {
        setIsVisible(false);
        setConfetti([]);
        clearInterval(animationInterval);
        onComplete?.();
      }, duration);

      return () => {
        clearInterval(animationInterval);
        clearTimeout(cleanup);
      };
    }
  }, [isActive, duration, intensity]);

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {confetti.map(piece => (
            <motion.div
              key={piece.id}
              className="absolute"
              style={{
                left: piece.x,
                top: piece.y,
                width: piece.size,
                height: piece.size,
                backgroundColor: piece.color,
                transform: `rotate(${piece.rotation}deg)`,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
};

// Hook for easy confetti triggering
export const useConfetti = () => {
  const [isActive, setIsActive] = useState(false);

  const triggerConfetti = (options?: {
    intensity?: 'light' | 'medium' | 'heavy';
    duration?: number;
    colors?: string[];
  }) => {
    setIsActive(true);
  };

  const stopConfetti = () => {
    setIsActive(false);
  };

  return {
    isActive,
    triggerConfetti,
    stopConfetti,
    ConfettiComponent: (props: Omit<ConfettiAnimationProps, 'isActive'>) => (
      <ConfettiAnimation isActive={isActive} {...props} />
    )
  };
};

// Milestone-specific confetti variants
export const OrderMilestoneConfetti: React.FC<{
  milestone: 'first_order' | 'tenth_order' | 'big_order' | 'repeat_customer';
  isActive: boolean;
  onComplete?: () => void;
}> = ({ milestone, isActive, onComplete }) => {
  const milestoneConfig = {
    first_order: {
      intensity: 'heavy' as const,
      duration: 4000,
      colors: ['#10b981', '#34d399', '#f59e0b', '#3b82f6']
    },
    tenth_order: {
      intensity: 'heavy' as const,
      duration: 5000,
      colors: ['#f59e0b', '#ef4444', '#8b5cf6', '#10b981']
    },
    big_order: {
      intensity: 'medium' as const,
      duration: 3000,
      colors: ['#10b981', '#059669', '#f59e0b']
    },
    repeat_customer: {
      intensity: 'light' as const,
      duration: 2500,
      colors: ['#10b981', '#34d399', '#06b6d4']
    }
  };

  const config = milestoneConfig[milestone];

  return (
    <ConfettiAnimation
      isActive={isActive}
      intensity={config.intensity}
      duration={config.duration}
      colors={config.colors}
      onComplete={onComplete}
    />
  );
};