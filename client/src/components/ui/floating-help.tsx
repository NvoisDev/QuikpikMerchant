import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, MessageCircle, Book, Video, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent } from './card';
import { ContextualHelp } from './contextual-help';
import { DynamicTooltip } from './dynamic-tooltip';

interface FloatingHelpProps {
  context: string;
  className?: string;
}

const quickTips = {
  'product-management': [
    {
      title: 'Auto-Calculate Shipping Weight',
      description: 'Use unit configuration to automatically calculate precise shipping weights',
      icon: '📦'
    },
    {
      title: 'Bulk Upload Products',
      description: 'Download CSV template and upload multiple products at once',
      icon: '📊'
    },
    {
      title: 'Set Minimum Orders',
      description: 'Configure MOQ to ensure profitable wholesale transactions',
      icon: '💰'
    }
  ],
  'customer-portal': [
    {
      title: 'SMS Authentication',
      description: 'Customers verify with phone number for secure access',
      icon: '🔐'
    },
    {
      title: 'Payment Processing',
      description: 'Secure Stripe payments with transparent fee structure',
      icon: '💳'
    },
    {
      title: 'Shipping Calculator',
      description: 'Real-time shipping quotes based on product weights',
      icon: '🚚'
    }
  ]
};

export const FloatingHelp: React.FC<FloatingHelpProps> = ({
  context,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltips, setShowTooltips] = useState(false);

  const tips = quickTips[context as keyof typeof quickTips] || [];

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${className}`}>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-4"
          >
            <Card className="w-80 shadow-xl border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                    <Book className="w-4 h-4 text-blue-600" />
                    <span>Quick Tips</span>
                  </h3>
                  <div className="flex items-center space-x-2">
                    <DynamicTooltip
                      content={showTooltips ? "Hide helpful tooltips" : "Show helpful tooltips throughout the interface"}
                      type="tip"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTooltips(!showTooltips)}
                        className={`w-8 h-8 p-0 rounded-full transition-colors ${
                          showTooltips 
                            ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    </DynamicTooltip>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsExpanded(false)}
                      className="w-6 h-6 p-0 hover:bg-gray-200"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-3 mb-4">
                  {tips.map((tip, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start space-x-3 p-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <span className="text-lg">{tip.icon}</span>
                      <div>
                        <h4 className="font-medium text-sm text-gray-900">{tip.title}</h4>
                        <p className="text-xs text-gray-600 mt-1">{tip.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex space-x-2">
                  <ContextualHelp
                    context={context}
                    resources={[]}
                    position="top-right"
                    trigger="text"
                    customTrigger={
                      <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                        <Book className="w-4 h-4 mr-2" />
                        Full Guide
                      </Button>
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://help.quikpik.co', '_blank')}
                    className="flex-1"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Help Center
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Help Button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative"
      >
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            w-14 h-14 rounded-full shadow-lg transition-all duration-300
            ${isExpanded 
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200' 
              : 'bg-white hover:bg-blue-50 text-blue-600 border border-blue-300 shadow-blue-100'
            }
          `}
        >
          <AnimatePresence mode="wait">
            {isExpanded ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-6 h-6" />
              </motion.div>
            ) : (
              <motion.div
                key="help"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <HelpCircle className="w-6 h-6" />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>

        {/* Pulsing indicator for new users */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.3, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute -inset-1 bg-blue-400 rounded-full -z-10"
        />
      </motion.div>
    </div>
  );
};

export default FloatingHelp;