import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Gift, Trophy, Star, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrderMilestoneConfetti } from './ConfettiAnimation';

interface OrderSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderDetails: {
    orderNumber: string;
    total: string;
    items: Array<{
      name: string;
      quantity: number;
    }>;
  };
  milestone?: {
    type: 'first_order' | 'tenth_order' | 'big_order' | 'repeat_customer';
    message: string;
    description?: string;
  };
}

const milestoneIcons = {
  first_order: Gift,
  tenth_order: Trophy,
  big_order: Star,
  repeat_customer: Heart
};

const milestoneColors = {
  first_order: 'text-green-600',
  tenth_order: 'text-yellow-500',
  big_order: 'text-blue-600',
  repeat_customer: 'text-pink-600'
};

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  isOpen,
  onClose,
  orderDetails,
  milestone
}) => {
  const [showConfetti, setShowConfetti] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Start confetti immediately
      setShowConfetti(true);
      
      // Show milestone after a brief delay if there is one
      if (milestone) {
        const timer = setTimeout(() => {
          setShowMilestone(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else {
      setShowConfetti(false);
      setShowMilestone(false);
    }
  }, [isOpen, milestone]);

  const MilestoneIcon = milestone ? milestoneIcons[milestone.type] : null;
  const milestoneColor = milestone ? milestoneColors[milestone.type] : '';

  return (
    <>
      {/* Confetti Animation */}
      {milestone && (
        <OrderMilestoneConfetti
          milestone={milestone.type}
          isActive={showConfetti}
          onComplete={() => setShowConfetti(false)}
        />
      )}
      
      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black bg-opacity-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            
            {/* Modal Content */}
            <motion.div
              className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
            >
              {/* Success Header */}
              <div className="relative bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", bounce: 0.6 }}
                  className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mb-4"
                >
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </motion.div>
                
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                >
                  Order Placed Successfully!
                </motion.h2>
                
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-600 dark:text-gray-300"
                >
                  Order #{orderDetails.orderNumber}
                </motion.p>
              </div>

              {/* Order Details */}
              <div className="p-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="space-y-4"
                >
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Order Summary</h3>
                    <div className="space-y-2">
                      {orderDetails.items.map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-300">
                            {item.name} × {item.quantity}
                          </span>
                        </div>
                      ))}
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between font-semibold">
                          <span>Total:</span>
                          <span className="text-green-600">{orderDetails.total}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Milestone Celebration */}
                  <AnimatePresence>
                    {milestone && showMilestone && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -20 }}
                        className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800"
                      >
                        <div className="flex items-start space-x-3">
                          {MilestoneIcon && (
                            <div className={`flex-shrink-0 ${milestoneColor}`}>
                              <MilestoneIcon className="w-6 h-6" />
                            </div>
                          )}
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              {milestone.message}
                            </h4>
                            {milestone.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                {milestone.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="flex space-x-3"
                >
                  <Button
                    onClick={onClose}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    Continue Shopping
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Navigate to orders page or order tracking
                      onClose();
                    }}
                    className="flex-1"
                  >
                    View Order
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};