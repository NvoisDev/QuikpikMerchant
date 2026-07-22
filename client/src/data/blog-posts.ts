import heroInventoryImage from '@assets/blog-hero-no-logo.png';
import { sharedBlogPosts, type ContentBlock, type SharedBlogPost } from '@shared/blog-posts-data';

export type { ContentBlock, SharedBlogPost };

export interface BlogPost extends SharedBlogPost {
  heroImage?: string;
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

const heroImages: Record<string, string> = {
  'inventory-management-batch-tracking': heroInventoryImage,
};

export const blogPosts: BlogPost[] = sharedBlogPosts.map((post) => ({
  ...post,
  heroImage: heroImages[post.slug],
}));
