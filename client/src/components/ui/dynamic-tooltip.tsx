import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { HelpCircle, Info, AlertTriangle, CheckCircle, Lightbulb, Star } from 'lucide-react';

interface TooltipPosition {
  top: number;
  left: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

interface DynamicTooltipProps {
  content: string;
  title?: string;
  type?: 'info' | 'help' | 'warning' | 'success' | 'tip' | 'feature';
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  maxWidth?: number;
  children: React.ReactNode;
  disabled?: boolean;
  showIcon?: boolean;
  contextual?: boolean;
  trigger?: 'hover' | 'click' | 'focus';
}

const getTooltipIcon = (type: string) => {
  switch (type) {
    case 'help': return <HelpCircle className="w-4 h-4" />;
    case 'warning': return <AlertTriangle className="w-4 h-4" />;
    case 'success': return <CheckCircle className="w-4 h-4" />;
    case 'tip': return <Lightbulb className="w-4 h-4" />;
    case 'feature': return <Star className="w-4 h-4" />;
    default: return <Info className="w-4 h-4" />;
  }
};

const getTooltipStyles = (type: string) => {
  switch (type) {
    case 'help':
      return {
        bg: 'bg-blue-900',
        border: 'border-blue-600',
        text: 'text-blue-100',
        iconColor: 'text-blue-300'
      };
    case 'warning':
      return {
        bg: 'bg-amber-900',
        border: 'border-amber-600',
        text: 'text-amber-100',
        iconColor: 'text-amber-300'
      };
    case 'success':
      return {
        bg: 'bg-green-900',
        border: 'border-green-600',
        text: 'text-green-100',
        iconColor: 'text-green-300'
      };
    case 'tip':
      return {
        bg: 'bg-purple-900',
        border: 'border-purple-600',
        text: 'text-purple-100',
        iconColor: 'text-purple-300'
      };
    case 'feature':
      return {
        bg: 'bg-indigo-900',
        border: 'border-indigo-600',
        text: 'text-indigo-100',
        iconColor: 'text-indigo-300'
      };
    default:
      return {
        bg: 'bg-gray-900',
        border: 'border-gray-600',
        text: 'text-gray-100',
        iconColor: 'text-gray-300'
      };
  }
};

const calculatePosition = (
  triggerRef: React.RefObject<HTMLElement>,
  tooltipWidth: number,
  tooltipHeight: number,
  preferredPlacement: string
): TooltipPosition => {
  if (!triggerRef.current) {
    return { top: 0, left: 0, placement: 'top' };
  }

  const triggerRect = triggerRef.current.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const spacing = 8; // Gap between trigger and tooltip

  // Calculate positions for each placement
  const positions = {
    top: {
      top: triggerRect.top + scrollY - tooltipHeight - spacing,
      left: triggerRect.left + scrollX + triggerRect.width / 2 - tooltipWidth / 2,
      placement: 'top' as const
    },
    bottom: {
      top: triggerRect.bottom + scrollY + spacing,
      left: triggerRect.left + scrollX + triggerRect.width / 2 - tooltipWidth / 2,
      placement: 'bottom' as const
    },
    left: {
      top: triggerRect.top + scrollY + triggerRect.height / 2 - tooltipHeight / 2,
      left: triggerRect.left + scrollX - tooltipWidth - spacing,
      placement: 'left' as const
    },
    right: {
      top: triggerRect.top + scrollY + triggerRect.height / 2 - tooltipHeight / 2,
      left: triggerRect.right + scrollX + spacing,
      placement: 'right' as const
    }
  };

  // Check if preferred placement fits
  if (preferredPlacement !== 'auto') {
    const position = positions[preferredPlacement as keyof typeof positions];
    const fitsHorizontally = position.left >= 0 && position.left + tooltipWidth <= viewportWidth;
    const fitsVertically = position.top >= scrollY && position.top + tooltipHeight <= scrollY + viewportHeight;
    
    if (fitsHorizontally && fitsVertically) {
      return position;
    }
  }

  // Auto-placement: find the best fit
  const placements: (keyof typeof positions)[] = ['bottom', 'top', 'right', 'left'];
  
  for (const placement of placements) {
    const position = positions[placement];
    const fitsHorizontally = position.left >= 0 && position.left + tooltipWidth <= viewportWidth;
    const fitsVertically = position.top >= scrollY && position.top + tooltipHeight <= scrollY + viewportHeight;
    
    if (fitsHorizontally && fitsVertically) {
      return position;
    }
  }

  // Fallback to bottom if nothing fits perfectly
  return positions.bottom;
};

export const DynamicTooltip: React.FC<DynamicTooltipProps> = ({
  content,
  title,
  type = 'info',
  placement = 'auto',
  delay = 200,
  maxWidth = 300,
  children,
  disabled = false,
  showIcon = true,
  contextual = false,
  trigger = 'hover'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0, placement: 'top' });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const styles = getTooltipStyles(type);
  const icon = getTooltipIcon(type);

  const showTooltip = () => {
    if (disabled) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const toggleTooltip = () => {
    if (disabled) return;
    setIsVisible(!isVisible);
  };

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const newPosition = calculatePosition(
        triggerRef,
        tooltipRect.width || maxWidth,
        tooltipRect.height || 100,
        placement
      );
      setPosition(newPosition);
    }
  }, [isVisible, placement, maxWidth]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleTriggerEvents = () => {
    switch (trigger) {
      case 'click':
        return {
          onClick: toggleTooltip,
          onBlur: hideTooltip
        };
      case 'focus':
        return {
          onFocus: showTooltip,
          onBlur: hideTooltip
        };
      default: // hover
        return {
          onMouseEnter: showTooltip,
          onMouseLeave: hideTooltip,
          onFocus: showTooltip,
          onBlur: hideTooltip
        };
    }
  };

  const getArrowClasses = (placement: string) => {
    const baseArrow = `absolute w-0 h-0 border-4 border-solid`;
    const arrowBg = styles.bg.replace('bg-', 'border-');
    
    switch (placement) {
      case 'top':
        return `${baseArrow} ${arrowBg} border-t-transparent border-l-transparent border-r-transparent top-full left-1/2 transform -translate-x-1/2`;
      case 'bottom':
        return `${baseArrow} ${arrowBg} border-b-transparent border-l-transparent border-r-transparent bottom-full left-1/2 transform -translate-x-1/2`;
      case 'left':
        return `${baseArrow} ${arrowBg} border-l-transparent border-t-transparent border-b-transparent left-full top-1/2 transform -translate-y-1/2`;
      case 'right':
        return `${baseArrow} ${arrowBg} border-r-transparent border-t-transparent border-b-transparent right-full top-1/2 transform -translate-y-1/2`;
      default:
        return '';
    }
  };

  const tooltipContent = (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={`
            fixed z-50 px-3 py-2 rounded-lg shadow-lg border
            ${styles.bg} ${styles.border} ${styles.text}
          `}
          style={{
            top: position.top,
            left: position.left,
            maxWidth: maxWidth,
            minWidth: 'max-content'
          }}
          onMouseEnter={trigger === 'hover' ? () => setIsVisible(true) : undefined}
          onMouseLeave={trigger === 'hover' ? hideTooltip : undefined}
        >
          {/* Arrow */}
          <div className={getArrowClasses(position.placement)} />
          
          {/* Content */}
          <div className="relative">
            {title && (
              <div className={`flex items-center space-x-2 mb-1 font-semibold text-sm ${styles.iconColor}`}>
                {showIcon && <span className={styles.iconColor}>{icon}</span>}
                <span>{title}</span>
              </div>
            )}
            <div className={`text-sm leading-relaxed ${!title && showIcon ? 'flex items-start space-x-2' : ''}`}>
              {!title && showIcon && <span className={`${styles.iconColor} mt-0.5 flex-shrink-0`}>{icon}</span>}
              <span dangerouslySetInnerHTML={{ __html: content }} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className={`inline-block ${trigger === 'click' ? 'cursor-pointer' : ''}`}
        {...handleTriggerEvents()}
        tabIndex={trigger === 'focus' ? 0 : undefined}
      >
        {children}
      </div>
      {typeof document !== 'undefined' && createPortal(tooltipContent, document.body)}
    </>
  );
};

// Contextual tooltip components for common use cases
export const HelpTooltip: React.FC<{ content: string; title?: string; children: React.ReactNode }> = ({
  content,
  title,
  children
}) => (
  <DynamicTooltip type="help" content={content} title={title} placement="top">
    {children}
  </DynamicTooltip>
);

export const InfoTooltip: React.FC<{ content: string; children: React.ReactNode }> = ({
  content,
  children
}) => (
  <DynamicTooltip type="info" content={content} placement="auto">
    {children}
  </DynamicTooltip>
);

export const WarningTooltip: React.FC<{ content: string; title?: string; children: React.ReactNode }> = ({
  content,
  title,
  children
}) => (
  <DynamicTooltip type="warning" content={content} title={title} placement="top">
    {children}
  </DynamicTooltip>
);

export const FeatureTooltip: React.FC<{ content: string; title?: string; children: React.ReactNode }> = ({
  content,
  title,
  children
}) => (
  <DynamicTooltip type="feature" content={content} title={title} placement="bottom">
    {children}
  </DynamicTooltip>
);

export default DynamicTooltip;