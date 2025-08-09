import { useState, useEffect } from 'react';

export interface OrderMilestone {
  type: 'first_order' | 'tenth_order' | 'big_order' | 'repeat_customer';
  message: string;
  description?: string;
  threshold?: number;
}

interface UseOrderMilestonesProps {
  customerId?: string;
  orderTotal?: number;
  orderCount?: number;
}

export const useOrderMilestones = ({ 
  customerId, 
  orderTotal = 0, 
  orderCount = 0 
}: UseOrderMilestonesProps = {}) => {
  const [achievedMilestone, setAchievedMilestone] = useState<OrderMilestone | null>(null);

  // Define milestone thresholds
  const milestones: OrderMilestone[] = [
    {
      type: 'first_order',
      message: '🎉 Welcome to the family!',
      description: 'Thank you for your very first order with us. You\'re now part of our community!'
    },
    {
      type: 'tenth_order',
      message: '🏆 Loyal Customer Achievement!',
      description: 'You\'ve reached 10 orders! You\'re officially one of our most valued customers.',
      threshold: 10
    },
    {
      type: 'big_order',
      message: '⭐ Big Spender Alert!',
      description: 'Wow! This is your largest order yet. Thank you for your business!',
      threshold: 100 // £100+ order
    },
    {
      type: 'repeat_customer',
      message: '💚 Welcome Back!',
      description: 'Great to see you again! We love having returning customers.'
    }
  ];

  const checkMilestones = (newOrderData: {
    isFirstOrder?: boolean;
    totalOrderCount?: number;
    orderValue?: number;
    isReturningCustomer?: boolean;
    previousOrderValue?: number;
  }) => {
    const {
      isFirstOrder,
      totalOrderCount = 0,
      orderValue = 0,
      isReturningCustomer,
      previousOrderValue = 0
    } = newOrderData;

    // Check for first order
    if (isFirstOrder) {
      setAchievedMilestone(milestones.find(m => m.type === 'first_order') || null);
      return;
    }

    // Check for tenth order
    if (totalOrderCount === 10) {
      setAchievedMilestone(milestones.find(m => m.type === 'tenth_order') || null);
      return;
    }

    // Check for big order (larger than previous largest)
    if (orderValue >= 100 && orderValue > previousOrderValue) {
      setAchievedMilestone(milestones.find(m => m.type === 'big_order') || null);
      return;
    }

    // Check for returning customer (2nd+ order)
    if (isReturningCustomer && totalOrderCount === 2) {
      setAchievedMilestone(milestones.find(m => m.type === 'repeat_customer') || null);
      return;
    }

    // No milestone achieved
    setAchievedMilestone(null);
  };

  const clearMilestone = () => {
    setAchievedMilestone(null);
  };

  // Auto-check milestones when props change
  useEffect(() => {
    if (orderCount > 0) {
      checkMilestones({
        isFirstOrder: orderCount === 1,
        totalOrderCount: orderCount,
        orderValue: orderTotal,
        isReturningCustomer: orderCount > 1
      });
    }
  }, [orderCount, orderTotal]);

  return {
    achievedMilestone,
    checkMilestones,
    clearMilestone,
    milestones
  };
};

// Helper function to determine milestone from order data
export const detectOrderMilestone = (orderData: {
  customerOrderCount: number;
  orderTotal: number;
  customerPreviousOrders: any[];
  isNewCustomer: boolean;
}): OrderMilestone | null => {
  const { customerOrderCount, orderTotal, customerPreviousOrders, isNewCustomer } = orderData;

  // First order milestone
  if (isNewCustomer || customerOrderCount === 1) {
    return {
      type: 'first_order',
      message: '🎉 Welcome to the family!',
      description: 'Thank you for your very first order with us. You\'re now part of our community!'
    };
  }

  // Tenth order milestone
  if (customerOrderCount === 10) {
    return {
      type: 'tenth_order',
      message: '🏆 Loyal Customer Achievement!',
      description: 'You\'ve reached 10 orders! You\'re officially one of our most valued customers.'
    };
  }

  // Big order milestone (largest order so far)
  const previousHighest = Math.max(...customerPreviousOrders.map(o => parseFloat(o.total) || 0), 0);
  if (orderTotal >= 100 && orderTotal > previousHighest) {
    return {
      type: 'big_order',
      message: '⭐ Big Spender Alert!',
      description: 'Wow! This is your largest order yet. Thank you for your business!'
    };
  }

  // Returning customer milestone (2nd order)
  if (customerOrderCount === 2) {
    return {
      type: 'repeat_customer',
      message: '💚 Welcome Back!',
      description: 'Great to see you again! We love having returning customers.'
    };
  }

  return null;
};