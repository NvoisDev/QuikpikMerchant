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
  {
    id: '2',
    slug: 'understanding-margins-wholesale',
    title: 'Understanding Margins in Wholesale: How to Track, Protect, and Improve Your Profitability',
    excerpt:
      'Gross margin is one of the most important numbers in any wholesale business — yet many wholesalers don\'t track it product by product. Here\'s what margin really means, why it matters, and how Quikpik makes it easy to stay on top of it.',
    category: 'Business Growth',
    tags: ['margins', 'profitability', 'cost price', 'wholesale', 'business growth'],
    readingTime: 7,
    publishDate: '2026-07-05',
    author: 'Quikpik Team',
    authorTitle: 'Wholesale Operations',
    featured: false,
    content: [
      {
        type: 'p',
        text: 'Revenue is vanity. Profit is sanity. It\'s an old saying, but it rings especially true in wholesale — where large order volumes can mask wafer-thin margins, and a single pricing mistake can quietly turn a profitable line into a loss-maker.',
      },
      {
        type: 'p',
        text: 'Understanding your margins — and tracking them consistently — is one of the most powerful habits you can build as a wholesaler. Yet many businesses still rely on gut feel, or only review margins at year-end when it\'s too late to act.',
      },
      {
        type: 'pullquote',
        text: 'Knowing your margin on every product isn\'t just good accounting — it\'s the foundation of every smart pricing decision you\'ll ever make.',
      },
      {
        type: 'h2',
        text: 'What Is Gross Margin?',
        id: 'what-is-gross-margin',
      },
      {
        type: 'p',
        text: 'Gross margin is the difference between what you sell a product for and what it cost you to buy it, expressed as a percentage of your selling price.',
      },
      {
        type: 'p',
        text: 'For example: if you buy a case of goods for £20 and sell it for £30, your gross profit is £10. Your gross margin is 33%. That means for every £1 of revenue you collect, 33p goes toward covering your overheads and generating net profit.',
      },
      {
        type: 'ul',
        intro: 'Gross margin matters because it tells you:',
        items: [
          'Whether your pricing is actually working',
          'Which products are driving real profit — and which are just driving volume',
          'How much room you have to offer discounts without going into the red',
          'How vulnerable your business is to supplier price increases',
          'Whether you can afford to grow at current pricing',
        ],
      },
      {
        type: 'h2',
        text: 'The Difference Between Margin and Markup',
        id: 'margin-vs-markup',
      },
      {
        type: 'p',
        text: 'These two terms are often confused, and mixing them up can lead to real pricing errors. Markup is how much you add to your cost price. Margin is how much of your selling price is profit.',
      },
      {
        type: 'p',
        text: 'Using the same example: a £20 cost with a £10 profit is a 50% markup — but only a 33% margin. If you\'re targeting a 50% margin, you actually need to charge £40, not £30. Getting this wrong, even slightly, across hundreds of products can cost a business tens of thousands per year.',
      },
      {
        type: 'pullquote',
        text: 'A 50% markup is not the same as a 50% margin. Wholesalers who confuse the two often underprice without realising it.',
      },
      {
        type: 'h2',
        text: 'Why Margin Tracking Is Hard Without the Right Tools',
        id: 'why-tracking-is-hard',
      },
      {
        type: 'p',
        text: 'In theory, tracking margin sounds simple. In practice, wholesale businesses face several challenges that make it surprisingly difficult.',
      },
      {
        type: 'ul',
        intro: 'Common obstacles include:',
        items: [
          'Purchase costs vary from batch to batch as supplier prices change',
          'Different customers pay different prices, so margin varies per sale',
          'Volume discounts and promotions erode margin in ways that aren\'t always visible',
          'Freight, storage, and handling costs are often not factored in',
          'Without a dedicated system, margin calculations have to be done manually per product',
        ],
      },
      {
        type: 'p',
        text: 'The result is that many wholesalers end up managing margin at the business level — looking at overall profit at month-end — rather than at the product level, where the real decisions happen.',
      },
      {
        type: 'h2',
        text: 'How Batch Costing Works in Quikpik',
        id: 'batch-costing-quikpik',
      },
      {
        type: 'p',
        text: 'Quikpik tracks cost price at the batch level. When you receive stock, you record how many units arrived and what you paid for them. This means every batch of stock you hold has a cost price attached — and as batches are sold through and new ones arrive, your cost data stays current.',
      },
      {
        type: 'p',
        text: 'This is important because supplier prices are rarely static. The batch you bought in January may have cost £18 per case. The one that arrived in June might cost £21. Quikpik treats these as separate batches, each with their own cost, so your margin calculations always reflect what you actually paid — not an outdated average.',
      },
      {
        type: 'p',
        text: 'Note: cost price in Quikpik is indicative of your purchase price per unit for each batch. It does not automatically include freight, handling, or any other landed costs unless you factor those into the price you enter. For the most accurate margin picture, we recommend recording the full landed cost per unit when creating a batch.',
      },
      {
        type: 'pullquote',
        text: '"Cost is indicative of your purchase price per unit for this batch." Enter your landed cost for the most accurate margin view.',
      },
      {
        type: 'h2',
        text: 'Weighted-Average Costing: Smoothing Out Price Volatility',
        id: 'weighted-average-costing',
      },
      {
        type: 'p',
        text: 'When you hold multiple batches of the same product at different cost prices, Quikpik uses a weighted-average cost (WAC) to give you a blended margin view. Rather than reporting margin based on whichever batch happens to be sold next, WAC takes all your current stock into account and gives you a more stable picture of your overall position.',
      },
      {
        type: 'p',
        text: 'For example: if you hold 100 units at £18 and 200 units at £21, your WAC is £20 per unit. When you look at the margin on a sale, Quikpik uses this blended cost rather than a single batch cost — which means your margin reporting is less prone to volatility caused by the order in which stock happens to be picked.',
      },
      {
        type: 'p',
        text: 'This is the same approach used by many established accounting systems, and it strikes a practical balance between accuracy and simplicity for most wholesale businesses.',
      },
      {
        type: 'h2',
        text: 'Seeing Margin in Real Time',
        id: 'real-time-margin',
      },
      {
        type: 'p',
        text: 'Quikpik\'s margin calculator gives you live margin visibility as you build and price quotes. Enter the selling price, and you immediately see the margin percentage — so you can make confident pricing decisions without switching between spreadsheets.',
      },
      {
        type: 'p',
        text: 'You can also view cost price and margin data directly on product cards and in the product grid, giving your team a clear at-a-glance view of profitability across your entire catalogue. There\'s no need to run a separate report — the information is there whenever you need it.',
      },
      {
        type: 'checklist',
        intro: 'With Quikpik\'s margin tools, you can:',
        items: [
          'Record cost price per batch so your margin data stays accurate as supplier prices change',
          'View live margin calculations while building a quote',
          'See cost price on product cards and in the product grid',
          'Track blended cost using weighted-average costing across multiple batches',
          'Export margin data to PDF when sharing quotes with your team',
          'Include margin data in your product CSV export for external reporting',
        ],
      },
      {
        type: 'h2',
        text: 'Practical Tips for Improving Wholesale Margins',
        id: 'improving-margins',
      },
      {
        type: 'p',
        text: 'Understanding your margins is the first step. Acting on them is where the real gains happen. Here are some practical habits that help wholesalers protect and grow their profitability.',
      },
      {
        type: 'ol',
        items: [
          {
            title: 'Set a minimum margin threshold per product line',
            body: 'Decide upfront what the lowest acceptable margin is for each category. If a product consistently falls below that threshold, it\'s a signal to renegotiate with suppliers or re-evaluate pricing — not a reason to keep selling at a loss.',
          },
          {
            title: 'Review margins before offering discounts',
            body: 'A 10% discount sounds manageable, but on a 20% margin product, it wipes out half your profit. Always check the impact on margin before agreeing to a price reduction.',
          },
          {
            title: 'Update cost prices when supplier prices change',
            body: 'Margin data is only useful if it\'s current. When you receive a new batch at a different price, update it immediately. Stale cost data leads to stale margin decisions.',
          },
          {
            title: 'Identify your highest and lowest margin products',
            body: 'Your best-selling product isn\'t always your most profitable. Regularly reviewing margin by product helps you focus sales energy where it creates the most value.',
          },
          {
            title: 'Factor in all landed costs',
            body: 'Purchase price is just the start. Freight, import duties, and storage all affect true margin. If these are significant in your business, include them in your cost price entries so your margin view is accurate.',
          },
        ],
      },
      {
        type: 'h2',
        text: 'Final Thoughts',
        id: 'final-thoughts',
      },
      {
        type: 'p',
        text: 'Margins are the heartbeat of a wholesale business. You can grow revenue, win new customers, and increase order volumes — but if margins are eroding quietly in the background, none of that growth translates to a healthier business.',
      },
      {
        type: 'p',
        text: 'The wholesalers who thrive long-term are the ones who know their numbers. They understand what each product actually costs, what it sells for, and what that leaves them with. They catch margin problems early, before they become embedded habits.',
      },
      {
        type: 'pullquote',
        text: 'The most successful wholesalers don\'t just grow revenue — they grow profit. And that starts with knowing your margin on every single product.',
      },
      {
        type: 'p',
        text: 'Quikpik was built to make that visibility easy, so you can spend less time digging through spreadsheets and more time making confident decisions about pricing, purchasing, and growth.',
      },
    ],
  },
];
