import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, ChevronRight, Lightbulb, BookOpen, Video, ExternalLink } from 'lucide-react';
import { Button } from './button';
import { DynamicTooltip } from './dynamic-tooltip';

interface HelpResource {
  title: string;
  description: string;
  type: 'guide' | 'video' | 'tooltip' | 'external';
  content?: string;
  url?: string;
  duration?: string;
}

interface ContextualHelpProps {
  context: string;
  resources: HelpResource[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
  trigger?: 'icon' | 'text' | 'custom';
  customTrigger?: React.ReactNode;
  autoShow?: boolean;
  showOnlyOnce?: boolean;
  className?: string;
}

const helpContexts = {
  'product-management': {
    title: 'Product Management Help',
    description: 'Learn how to manage your product inventory effectively',
    resources: [
      {
        title: 'Adding Your First Product',
        description: 'Step-by-step guide to creating product listings',
        type: 'guide' as const,
        content: `
          <div class="space-y-4">
            <div class="bg-blue-50 p-3 rounded-lg">
              <h4 class="font-semibold text-blue-900 mb-2">Quick Start Guide</h4>
              <ol class="list-decimal list-inside space-y-2 text-sm text-blue-800">
                <li>Click the "Add Product" button</li>
                <li>Fill in product name and description</li>
                <li>Set your pricing and minimum order quantity</li>
                <li>Configure unit measurements for accurate shipping</li>
                <li>Add product images for better visibility</li>
                <li>Save and activate your product</li>
              </ol>
            </div>
            <div class="bg-green-50 p-3 rounded-lg">
              <h4 class="font-semibold text-green-900 mb-2">Pro Tips</h4>
              <ul class="list-disc list-inside space-y-1 text-sm text-green-800">
                <li>Use clear, descriptive product names</li>
                <li>Include keywords customers might search for</li>
                <li>Set competitive minimum order quantities</li>
                <li>Enable auto-calculation for shipping weights</li>
              </ul>
            </div>
          </div>
        `
      },
      {
        title: 'Unit Configuration & Shipping',
        description: 'How to set up accurate shipping calculations',
        type: 'guide' as const,
        content: `
          <div class="space-y-4">
            <div class="bg-purple-50 p-3 rounded-lg">
              <h4 class="font-semibold text-purple-900 mb-2">Unit Configuration</h4>
              <p class="text-sm text-purple-800 mb-3">Configure your product units for accurate shipping quotes:</p>
              <div class="grid grid-cols-1 gap-3">
                <div class="bg-white p-2 rounded border">
                  <strong>Example 1:</strong> 24 × 250ml cans
                  <br><small>Quantity: 24, Unit: ml, Size: 250</small>
                </div>
                <div class="bg-white p-2 rounded border">
                  <strong>Example 2:</strong> 20 × 100g packets
                  <br><small>Quantity: 20, Unit: g, Size: 100</small>
                </div>
              </div>
            </div>
            <div class="bg-orange-50 p-3 rounded-lg">
              <h4 class="font-semibold text-orange-900 mb-2">Auto-Calculation</h4>
              <p class="text-sm text-orange-800">The system automatically calculates total package weight based on your unit configuration, making shipping quotes more accurate.</p>
            </div>
          </div>
        `
      },
      {
        title: 'Bulk Product Upload',
        description: 'Upload multiple products using CSV templates',
        type: 'video' as const,
        duration: '3 min',
        content: `
          <div class="space-y-4">
            <div class="bg-gray-50 p-3 rounded-lg">
              <h4 class="font-semibold text-gray-900 mb-2">CSV Upload Process</h4>
              <ol class="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Download the CSV template</li>
                <li>Fill in your product data</li>
                <li>Upload the completed file</li>
                <li>Review and confirm products</li>
              </ol>
            </div>
            <div class="aspect-video bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center">
              <div class="text-center">
                <Video className="w-12 h-12 text-blue-600 mx-auto mb-2" />
                <p class="text-sm text-gray-600">Video tutorial coming soon</p>
              </div>
            </div>
          </div>
        `
      }
    ]
  },
  'customer-portal': {
    title: 'Customer Portal Help',
    description: 'Help customers navigate and place orders',
    resources: [
      {
        title: 'Customer Authentication',
        description: 'How SMS verification works for customers',
        type: 'guide' as const,
        content: `
          <div class="space-y-4">
            <div class="bg-blue-50 p-3 rounded-lg">
              <h4 class="font-semibold text-blue-900 mb-2">Authentication Process</h4>
              <ol class="list-decimal list-inside space-y-2 text-sm text-blue-800">
                <li>Customer enters their phone number</li>
                <li>SMS verification code is sent</li>
                <li>Customer enters the 6-digit code</li>
                <li>Access granted for 24 hours</li>
              </ol>
            </div>
            <div class="bg-green-50 p-3 rounded-lg">
              <h4 class="font-semibold text-green-900 mb-2">Security Features</h4>
              <ul class="list-disc list-inside space-y-1 text-sm text-green-800">
                <li>24-hour session persistence</li>
                <li>Automatic logout after inactivity</li>
                <li>Phone number verification</li>
              </ul>
            </div>
          </div>
        `
      },
      {
        title: 'Payment Processing',
        description: 'Understanding the checkout and payment flow',
        type: 'guide' as const,
        content: `
          <div class="space-y-4">
            <div class="bg-purple-50 p-3 rounded-lg">
              <h4 class="font-semibold text-purple-900 mb-2">Payment Structure</h4>
              <div class="text-sm text-purple-800">
                <p class="mb-2">Transaction fees are clearly displayed:</p>
                <ul class="list-disc list-inside space-y-1">
                  <li>Product subtotal</li>
                  <li>Transaction fee (5.5% + £0.50)</li>
                  <li>Shipping cost (if applicable)</li>
                  <li><strong>Total amount charged</strong></li>
                </ul>
              </div>
            </div>
            <div class="bg-green-50 p-3 rounded-lg">
              <h4 class="font-semibold text-green-900 mb-2">Secure Processing</h4>
              <p class="text-sm text-green-800">All payments processed securely through Stripe with automatic receipts.</p>
            </div>
          </div>
        `
      }
    ]
  },
  'shipping': {
    title: 'Shipping & Delivery Help',
    description: 'Configure shipping options and calculate costs',
    resources: [
      {
        title: 'Shipping Calculator',
        description: 'How precise shipping calculation works',
        type: 'guide' as const,
        content: `
          <div class="space-y-4">
            <div class="bg-blue-50 p-3 rounded-lg">
              <h4 class="font-semibold text-blue-900 mb-2">Calculation Methods</h4>
              <div class="text-sm text-blue-800">
                <p class="mb-2">The system uses two methods:</p>
                <ul class="list-disc list-inside space-y-1">
                  <li><strong>Precise:</strong> Based on unit configuration</li>
                  <li><strong>Estimated:</strong> Fallback weight calculation</li>
                </ul>
              </div>
            </div>
            <div class="bg-orange-50 p-3 rounded-lg">
              <h4 class="font-semibold text-orange-900 mb-2">Service Recommendations</h4>
              <ul class="list-disc list-inside space-y-1 text-sm text-orange-800">
                <li>Royal Mail: ≤20kg packages</li>
                <li>DPD: ≤30kg packages</li>
                <li>Pallet services: >1000kg orders</li>
              </ul>
            </div>
          </div>
        `
      }
    ]
  }
};

export const ContextualHelp: React.FC<ContextualHelpProps> = ({
  context,
  resources,
  position = 'top-right',
  trigger = 'icon',
  customTrigger,
  autoShow = false,
  showOnlyOnce = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(autoShow);
  const [selectedResource, setSelectedResource] = useState<HelpResource | null>(null);
  const [hasShown, setHasShown] = useState(false);
  const helpPanelRef = useRef<HTMLDivElement>(null);

  const contextData = helpContexts[context as keyof typeof helpContexts];
  const effectiveResources = resources.length > 0 ? resources : (contextData?.resources || []);
  const title = contextData?.title || 'Help';
  const description = contextData?.description || 'Get help with this feature';

  useEffect(() => {
    if (autoShow && !hasShown && !showOnlyOnce) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        setHasShown(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoShow, hasShown, showOnlyOnce]);

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'center':
        return 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2';
      default:
        return 'top-4 right-4';
    }
  };

  const renderTrigger = () => {
    if (customTrigger) {
      return (
        <div onClick={() => setIsOpen(true)} className="cursor-pointer">
          {customTrigger}
        </div>
      );
    }

    if (trigger === 'text') {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="text-blue-600 hover:text-blue-700 h-auto p-0 font-normal"
        >
          Need help?
        </Button>
      );
    }

    return (
      <DynamicTooltip content="Get contextual help" type="help">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="w-8 h-8 p-0 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </DynamicTooltip>
    );
  };

  const renderResourceIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="w-4 h-4 text-purple-600" />;
      case 'external':
        return <ExternalLink className="w-4 h-4 text-green-600" />;
      default:
        return <BookOpen className="w-4 h-4 text-blue-600" />;
    }
  };

  return (
    <>
      {/* Trigger */}
      <div className={className}>
        {renderTrigger()}
      </div>

      {/* Help Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-20 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Help Panel */}
            <motion.div
              ref={helpPanelRef}
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.2 }}
              className={`
                fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200
                w-96 max-w-[90vw] max-h-[80vh] overflow-hidden
                ${getPositionClasses()}
              `}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Lightbulb className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                    className="w-6 h-6 p-0 hover:bg-gray-200"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-600 mt-1">{description}</p>
              </div>

              {/* Content */}
              <div className="max-h-96 overflow-y-auto">
                {!selectedResource ? (
                  // Resource List
                  <div className="p-4 space-y-3">
                    {effectiveResources.map((resource, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="group p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all duration-200"
                        onClick={() => {
                          if (resource.type === 'external' && resource.url) {
                            window.open(resource.url, '_blank');
                          } else {
                            setSelectedResource(resource);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            {renderResourceIcon(resource.type)}
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 group-hover:text-blue-900">
                                {resource.title}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">
                                {resource.description}
                              </p>
                              {resource.duration && (
                                <span className="inline-block mt-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                                  {resource.duration}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  // Selected Resource Content
                  <div className="p-4">
                    <div className="flex items-center space-x-2 mb-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedResource(null)}
                        className="p-0 w-6 h-6"
                      >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                      </Button>
                      <h4 className="font-semibold text-gray-900">{selectedResource.title}</h4>
                    </div>
                    
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedResource.content || '' }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

// Quick help tooltips for form fields
export const QuickHelp: React.FC<{
  content: string;
  title?: string;
  type?: 'info' | 'tip' | 'warning';
}> = ({ content, title, type = 'info' }) => (
  <DynamicTooltip
    content={content}
    title={title}
    type={type}
    placement="top"
    maxWidth={280}
  >
    <HelpCircle className="w-4 h-4 text-gray-400 hover:text-blue-600 cursor-help ml-1" />
  </DynamicTooltip>
);

export default ContextualHelp;