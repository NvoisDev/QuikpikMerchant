import heroInventoryImage from '@assets/blog-hero-no-logo.png';

export type ContentBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string; id: string }
  | { type: 'ul'; intro?: string; items: string[] }
  | { type: 'ol'; items: { title: string; body: string }[] }
  | { type: 'pullquote'; text: string }
  | { type: 'checklist'; intro?: string; items: string[] };

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: ContentBlock[];
  category: string;
  tags: string[];
  readingTime: number;
  publishDate: string;
  author: string;
  authorTitle: string;
  heroImage?: string;
  featured: boolean;
}

export const BLOG_CATEGORIES = [
  'All',
  'Inventory Management',
  'Wholesale Operations',
  'Invoicing',
  'Payments',
  'Stock Control',
  'Customer Management',
  'Business Growth',
] as const;

export const blogPosts: BlogPost[] = [
  {
    id: '1',
    slug: 'inventory-management-batch-tracking',
    title: 'Inventory Management for Wholesalers: How Batch Tracking and Expiry Control Can Save Thousands',
    excerpt:
      'Stock discrepancies, expired products, and invisible waste can quietly erode profits before anyone notices. Here\'s how modern batch tracking and expiry date monitoring give wholesalers the visibility they need to stay in control.',
    category: 'Inventory Management',
    tags: ['inventory', 'batch tracking', 'expiry dates', 'stock control', 'wholesale'],
    readingTime: 7,
    publishDate: '2026-01-15',
    author: 'Quikpik Team',
    authorTitle: 'Wholesale Operations',
    heroImage: heroInventoryImage,
    featured: true,
    content: [
      {
        type: 'p',
        text: 'For many wholesalers, inventory is their single biggest investment. Yet it\'s often one of the least understood areas of the business.',
      },
      {
        type: 'p',
        text: 'Products are purchased, stored, sold, returned, written off, and replenished every day. Without proper controls, stock discrepancies, expired products, and waste can quietly eat into profits without anyone noticing until it\'s too late.',
      },
      {
        type: 'pullquote',
        text: 'The difference between a well-run wholesale operation and a struggling one often comes down to one thing: visibility.',
      },
      {
        type: 'h2',
        text: 'The Real Cost of Poor Inventory Management',
        id: 'real-cost',
      },
      {
        type: 'p',
        text: 'Many wholesalers focus heavily on sales but overlook the impact of poor stock control.',
      },
      {
        type: 'ul',
        intro: 'Common issues include:',
        items: [
          'Running out of stock unexpectedly',
          'Overstocking slow-moving products',
          'Selling products close to expiry',
          'Losing track of inventory across batches',
          'Manual spreadsheet errors',
          'Unexplained stock adjustments',
          'Wasted products that can no longer be sold',
        ],
      },
      {
        type: 'pullquote',
        text: 'If a business loses just £50 worth of stock each week through errors, damage, or expiry, that\'s over £2,600 per year gone straight from the bottom line.',
      },
      {
        type: 'h2',
        text: 'Why Batch Tracking Matters',
        id: 'batch-tracking',
      },
      {
        type: 'p',
        text: 'Not all stock arrives at the same time. You may receive 100 units in January, another 200 units in March, and a further 150 units in April. Each delivery may have different purchase costs, different expiry dates, different suppliers, and different profit margins.',
      },
      {
        type: 'p',
        text: 'Without batch tracking, it becomes almost impossible to know which stock should be sold first. Batch management allows wholesalers to trace inventory from the moment it arrives until the moment it leaves the warehouse.',
      },
      {
        type: 'ul',
        intro: 'Benefits include:',
        items: [
          'Better stock accuracy',
          'Easier recalls if needed',
          'Improved profitability reporting',
          'Reduced waste',
          'Better stock rotation',
        ],
      },
      {
        type: 'h2',
        text: 'Expiry Dates Should Never Be a Surprise',
        id: 'expiry-dates',
      },
      {
        type: 'p',
        text: 'For food wholesalers, beverage distributors, beauty suppliers, and many FMCG businesses, expiry dates are critical. Yet many businesses only discover products are nearing expiry when it\'s already too late.',
      },
      {
        type: 'ul',
        intro: 'By actively monitoring expiry dates, wholesalers can:',
        items: [
          'Prioritise older stock',
          'Create promotions before products expire',
          'Reduce waste',
          'Protect customer trust',
          'Improve cash flow',
        ],
      },
      {
        type: 'pullquote',
        text: 'A product sitting on a shelf beyond its expiry date is effectively money locked away that can no longer be recovered.',
      },
      {
        type: 'h2',
        text: 'Understanding Stock Waste',
        id: 'stock-waste',
      },
      {
        type: 'p',
        text: 'Waste isn\'t just products thrown away.',
      },
      {
        type: 'ul',
        intro: 'Waste can include:',
        items: [
          'Expired stock',
          'Damaged products',
          'Lost inventory',
          'Administrative errors',
          'Incorrect stock counts',
          'Duplicate stock adjustments',
        ],
      },
      {
        type: 'p',
        text: 'Tracking waste helps identify operational problems before they become expensive habits.',
      },
      {
        type: 'pullquote',
        text: 'The most profitable wholesalers don\'t just track sales — they track every stock movement.',
      },
      {
        type: 'h2',
        text: 'Why Spreadsheets Eventually Fail',
        id: 'spreadsheets-fail',
      },
      {
        type: 'p',
        text: 'Spreadsheets are often where inventory management begins. They\'re familiar, inexpensive, and easy to set up. However, as a business grows, spreadsheets become increasingly difficult to maintain.',
      },
      {
        type: 'ul',
        intro: 'Challenges include:',
        items: [
          'Human error',
          'Multiple versions of the same file',
          'Lack of real-time updates',
          'No audit trail',
          'No batch visibility',
          'Limited reporting',
        ],
      },
      {
        type: 'p',
        text: 'As order volumes increase, manual stock management becomes a risk rather than a solution.',
      },
      {
        type: 'h2',
        text: 'Best Practices for Modern Wholesalers',
        id: 'best-practices',
      },
      {
        type: 'p',
        text: 'Successful wholesalers typically follow these principles:',
      },
      {
        type: 'ol',
        items: [
          {
            title: 'Track Every Stock Movement',
            body: 'Every stock-in, sale, return, adjustment, and write-off should be recorded.',
          },
          {
            title: 'Manage Inventory by Batch',
            body: 'Know exactly where stock came from and when it arrived.',
          },
          {
            title: 'Monitor Expiry Dates',
            body: 'Identify products nearing expiry before they become unsellable.',
          },
          {
            title: 'Review Slow-Moving Products',
            body: 'Understand which products are tying up cash unnecessarily.',
          },
          {
            title: 'Use Real-Time Inventory Systems',
            body: 'Avoid relying solely on spreadsheets and manual calculations.',
          },
        ],
      },
      {
        type: 'h2',
        text: 'How Quikpik Helps Wholesalers Stay in Control',
        id: 'quikpik-helps',
      },
      {
        type: 'p',
        text: 'Quikpik was built specifically to help wholesalers manage inventory with confidence.',
      },
      {
        type: 'checklist',
        intro: 'With Quikpik, you can:',
        items: [
          'Track stock levels in real time',
          'Manage products by batch',
          'Monitor expiry dates',
          'View complete stock history',
          'Record stock adjustments and returns',
          'Reduce inventory waste',
          'Raise invoices directly from available stock',
          'See exactly what has been sold, allocated, returned, and remains in stock',
        ],
      },
      {
        type: 'p',
        text: 'Instead of relying on spreadsheets and manual reconciliations, Quikpik provides a complete picture of your inventory from purchase to sale.',
      },
      {
        type: 'h2',
        text: 'Final Thoughts',
        id: 'final-thoughts',
      },
      {
        type: 'p',
        text: 'Inventory management isn\'t just about counting products.',
      },
      {
        type: 'p',
        text: 'It\'s about protecting cash flow, reducing waste, improving customer service, and increasing profitability.',
      },
      {
        type: 'pullquote',
        text: 'Wholesalers that understand their inventory outperform those that don\'t. The better your visibility, the better your decisions.',
      },
      {
        type: 'p',
        text: 'And that\'s exactly what Quikpik was designed to deliver.',
      },
    ],
  },
];
