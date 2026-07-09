/**
 * server/seo.ts
 *
 * Server-side metadata and content injection for public routes.
 *
 * Given a request URL (pathname), returns:
 *   - Complete head tags (title, description, canonical, OG, Twitter, JSON-LD)
 *   - Minimal semantic HTML body content (H1 + primary copy) so non-JS crawlers
 *     can read meaningful content without executing JavaScript
 *
 * The body HTML is injected inside <div id="root"> and is replaced by React
 * on hydration, so it doesn't affect the interactive experience.
 */

import { db } from "./db";
import { users, products } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";

const BASE_URL = "https://quikpik.app";
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

export interface SeoMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  ogType: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  /** Serialised JSON-LD blob (already safe for <script> embedding) */
  jsonLd?: string;
  /** Minimal semantic HTML injected into <div id="root"> for crawlers */
  bodyHtml?: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Safely serialise a value as JSON for embedding inside a
 * `<script type="application/ld+json">` block.
 *
 * JSON.stringify alone is insufficient: a user-supplied string like
 * `"</script>"` would terminate the enclosing script element and allow
 * arbitrary HTML injection.  We neutralise the three dangerous sequences
 * by replacing them with their JSON Unicode-escape equivalents, which are
 * semantically equivalent but safe inside a script context.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

// ---------------------------------------------------------------------------
// Static blog post metadata
// ---------------------------------------------------------------------------

/** Keeps the server free of browser-only asset imports from blog-posts.ts */
interface BlogMeta {
  title: string;
  excerpt: string;
  publishDate: string;
  author: string;
  /** First few content paragraphs for crawler body injection */
  openingParagraphs: string[];
  /** H2 headings for crawler body injection */
  h2s: string[];
}

const BLOG_POST_META: Record<string, BlogMeta> = {
  "inventory-management-batch-tracking": {
    title:
      "Inventory Management for Wholesalers: How Batch Tracking and Expiry Control Can Save Thousands",
    excerpt:
      "Stock discrepancies, expired products, and invisible waste can quietly erode profits before anyone notices. Here's how modern batch tracking and expiry date monitoring give wholesalers the visibility they need to stay in control.",
    publishDate: "2026-01-15",
    author: "Quikpik Team",
    openingParagraphs: [
      "For many wholesalers, inventory is their single biggest investment. Yet it's often one of the least understood areas of the business.",
      "Products are purchased, stored, sold, returned, written off, and replenished every day. Without proper controls, stock discrepancies, expired products, and waste can quietly eat into profits without anyone noticing until it's too late.",
      "If a business loses just £50 worth of stock each week through errors, damage, or expiry, that's over £2,600 per year gone straight from the bottom line.",
    ],
    h2s: [
      "Why Batch Tracking Matters",
      "Expiry Dates Should Never Be a Surprise",
      "Understanding Stock Waste",
      "Why Spreadsheets Eventually Fail",
      "How Quikpik Helps Wholesalers Stay in Control",
    ],
  },
};

const ALL_BLOG_POSTS = Object.entries(BLOG_POST_META).map(([slug, m]) => ({
  slug,
  title: m.title,
  excerpt: m.excerpt,
  category: "Wholesale Operations",
}));

// ---------------------------------------------------------------------------
// Route-specific metadata + body content resolvers
// ---------------------------------------------------------------------------

function homeMeta(): SeoMeta {
  const title = "Quikpik — Wholesale Platform";
  const description =
    "Manage orders, customers, products, and revenue — all in one wholesale platform. Built for wholesalers who want to grow faster.";
  const bodyHtml = `
<main style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:1rem">
    Wholesale Operations, Simplified
  </h1>
  <p style="font-size:1.1rem;color:#444;margin-bottom:1rem">
    Quikpik is the all-in-one wholesale platform built for modern wholesalers.
    Manage products, orders, customers, invoices, inventory, and payments from
    a single dashboard.
  </p>
  <h2 style="font-size:1.4rem;font-weight:700;color:#111;margin:1.5rem 0 0.5rem">
    Built for Wholesalers
  </h2>
  <p style="color:#444;margin-bottom:1rem">
    Send invoices, manage stock levels, track orders, and communicate with
    customers — all without switching between tools. Quikpik integrates
    WhatsApp messaging, Stripe payments, and AI-powered product management
    in one platform.
  </p>
  <h2 style="font-size:1.4rem;font-weight:700;color:#111;margin:1.5rem 0 0.5rem">
    Your Public Wholesale Store
  </h2>
  <p style="color:#444;margin-bottom:1rem">
    Every wholesaler gets a branded public storefront where customers can browse
    your catalogue, request trade pricing, and place orders directly. Share your
    store link with buyers and grow your B2B network effortlessly.
  </p>
  <h2 style="font-size:1.4rem;font-weight:700;color:#111;margin:1.5rem 0 0.5rem">
    Inventory &amp; Stock Control
  </h2>
  <p style="color:#444">
    Track stock levels in real time, manage products by batch, monitor expiry
    dates, and record every stock movement. Know exactly what you have, where
    it is, and when you need to reorder.
  </p>
</main>`.trim();

  return {
    title,
    description,
    canonicalUrl: BASE_URL,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_IMAGE,
    ogUrl: BASE_URL,
    ogType: "website",
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: DEFAULT_IMAGE,
    bodyHtml,
  };
}

function blogIndexMeta(): SeoMeta {
  const title = "Wholesale Business Guides & Resources | Quikpik Blog";
  const description =
    "Practical guides, tips, and strategies for wholesale businesses — covering inventory management, invoicing, payments, stock control, and customer management.";
  const url = `${BASE_URL}/blog`;

  const postListHtml = ALL_BLOG_POSTS.map(
    (p) =>
      `<li style="margin-bottom:1rem"><a href="/blog/${escapeAttr(p.slug)}" style="font-size:1.05rem;font-weight:700;color:#15803d;text-decoration:none">${escapeHtml(p.title)}</a><p style="color:#555;margin:0.25rem 0 0">${escapeHtml(p.excerpt)}</p></li>`
  ).join("\n");

  const bodyHtml = `
<main style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:0.5rem">
    Wholesale Business Guides &amp; Resources
  </h1>
  <p style="color:#555;margin-bottom:2rem">
    Practical guides, tips, and strategies to help you run a better wholesale
    business — covering inventory, invoicing, payments, stock control, and more.
  </p>
  <ul style="list-style:none;padding:0;margin:0">
    ${postListHtml}
  </ul>
</main>`.trim();

  const jsonLd = safeJsonLd({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Quikpik Blog",
    description,
    url,
    publisher: {
      "@type": "Organization",
      name: "Quikpik",
      url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/favicon.png` },
    },
  });

  return {
    title,
    description,
    canonicalUrl: url,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_IMAGE,
    ogUrl: url,
    ogType: "website",
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: DEFAULT_IMAGE,
    jsonLd,
    bodyHtml,
  };
}

function blogPostMeta(slug: string): SeoMeta {
  const post = BLOG_POST_META[slug];
  const url = `${BASE_URL}/blog/${slug}`;

  if (!post) {
    return {
      title: "Article | Quikpik Blog",
      description: "Read expert wholesale business guides on the Quikpik blog.",
      canonicalUrl: url,
      ogTitle: "Article | Quikpik Blog",
      ogDescription: "Read expert wholesale business guides on the Quikpik blog.",
      ogImage: DEFAULT_IMAGE,
      ogUrl: url,
      ogType: "article",
      twitterTitle: "Article | Quikpik Blog",
      twitterDescription: "Read expert wholesale business guides on the Quikpik blog.",
      twitterImage: DEFAULT_IMAGE,
    };
  }

  const title = `${post.title} | Quikpik Blog`;
  const description = truncate(post.excerpt, 160);

  const h2sHtml = post.h2s
    .map((h) => `<h2 style="font-size:1.3rem;font-weight:700;color:#111;margin:1.5rem 0 0.5rem">${escapeHtml(h)}</h2>`)
    .join("\n");

  const parasHtml = post.openingParagraphs
    .map((p) => `<p style="color:#444;margin-bottom:0.75rem">${escapeHtml(p)}</p>`)
    .join("\n");

  const bodyHtml = `
<article style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:1rem">${escapeHtml(post.title)}</h1>
  <p style="color:#888;margin-bottom:1.5rem">By ${escapeHtml(post.author)} · ${post.publishDate}</p>
  ${parasHtml}
  ${h2sHtml}
</article>`.trim();

  const jsonLd = safeJsonLd({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    url,
    datePublished: post.publishDate,
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Quikpik",
      url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/favicon.png` },
    },
  });

  return {
    title,
    description,
    canonicalUrl: url,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_IMAGE,
    ogUrl: url,
    ogType: "article",
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: DEFAULT_IMAGE,
    jsonLd,
    bodyHtml,
  };
}

function termsMeta(): SeoMeta {
  const title = "Terms of Service | Quikpik";
  const description =
    "Read the Quikpik Terms of Service. Understand your rights and responsibilities when using the Quikpik wholesale platform.";
  const url = `${BASE_URL}/terms`;

  const sections = [
    { title: "About Quikpik", body: "Quikpik is a wholesale ordering and business management platform that helps wholesalers manage products, orders, invoices, inventory, customer communication, payments, and related business operations." },
    { title: "Using the Platform", body: "You must provide accurate business information, keep your login details secure, use the platform lawfully, and not misuse, copy, or interfere with the platform. You are responsible for all activity under your account." },
    { title: "Orders & Invoices", body: "Quikpik provides tools for creating and managing invoices, orders, stock, and customer communications. Businesses are responsible for ensuring pricing is accurate, managing inventory correctly, reviewing invoices before sending, and complying with tax and legal obligations." },
    { title: "Payments", body: "Where payments are processed through third-party providers (such as Stripe), those providers' terms also apply. Quikpik does not store full payment card details." },
    { title: "Messaging & Notifications", body: "The platform may send emails, SMS, or WhatsApp notifications based on your settings and actions taken within the platform." },
    { title: "Data & Privacy", body: "Your use of the platform is also governed by our Privacy Policy. We take reasonable measures to protect your data, but no online system can guarantee absolute security." },
    { title: "Availability", body: "We aim to keep Quikpik available and reliable, but we do not guarantee uninterrupted access at all times. Features may change, improve, or be removed over time." },
    { title: "Limitation of Liability", body: 'Quikpik is provided "as is." To the maximum extent permitted by law, Quikpik is not liable for loss of profits, business interruption, data loss, or indirect or consequential damages.' },
    { title: "Suspension or Termination", body: "We may suspend or terminate accounts that breach these terms, misuse the platform, or attempt fraudulent or harmful activity. You may stop using the platform at any time." },
    { title: "Changes to These Terms", body: "We may update these Terms occasionally. Continued use of Quikpik after updates means you accept the revised terms." },
  ];

  const sectionsHtml = sections
    .map(
      (s) =>
        `<section style="margin-bottom:1.5rem"><h2 style="font-size:1.15rem;font-weight:700;color:#111;margin-bottom:0.4rem">${escapeHtml(s.title)}</h2><p style="color:#444">${escapeHtml(s.body)}</p></section>`
    )
    .join("\n");

  const bodyHtml = `
<main style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:0.5rem">Terms of Service</h1>
  <p style="color:#888;margin-bottom:2rem">Last updated: August 2026</p>
  <p style="color:#444;margin-bottom:1.5rem">Please read these terms carefully before using Quikpik. They set out your rights and responsibilities.</p>
  ${sectionsHtml}
</main>`.trim();

  return {
    title,
    description,
    canonicalUrl: url,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_IMAGE,
    ogUrl: url,
    ogType: "website",
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: DEFAULT_IMAGE,
    bodyHtml,
  };
}

function privacyMeta(): SeoMeta {
  const title = "Privacy Policy | Quikpik";
  const description =
    "Read the Quikpik Privacy Policy. Learn how we collect, use, and protect your personal data on the Quikpik wholesale platform.";
  const url = `${BASE_URL}/privacy`;

  const sections = [
    { title: "Introduction", body: "Quikpik respects your privacy and is committed to protecting your information. This Privacy Policy explains how we collect, use, and store information when you use Quikpik.app." },
    { title: "Information We Collect", body: "We may collect name and business details, email address and phone number, delivery and billing addresses, product, order, and invoice data, payment-related information, and device and usage information." },
    { title: "How We Use Information", body: "We use your information to operate the platform, process orders and invoices, send notifications and updates, improve features and performance, provide support, and prevent fraud and misuse." },
    { title: "Payments", body: "Payments may be processed by third-party payment providers such as Stripe. Payment information is handled according to their security standards and policies." },
    { title: "Data Storage & Security", body: "We use reasonable technical and organisational measures to protect your data. However, no online service can guarantee complete security." },
    { title: "Your Rights", body: "You may request access to, correction of, or deletion of your personal data by contacting us. We will respond in accordance with applicable law." },
    { title: "Contact", body: "For privacy-related questions, contact us through Quikpik.app." },
  ];

  const sectionsHtml = sections
    .map(
      (s) =>
        `<section style="margin-bottom:1.5rem"><h2 style="font-size:1.15rem;font-weight:700;color:#111;margin-bottom:0.4rem">${escapeHtml(s.title)}</h2><p style="color:#444">${escapeHtml(s.body)}</p></section>`
    )
    .join("\n");

  const bodyHtml = `
<main style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:0.5rem">Privacy Policy</h1>
  <p style="color:#888;margin-bottom:2rem">Last updated: August 2026</p>
  ${sectionsHtml}
</main>`.trim();

  return {
    title,
    description,
    canonicalUrl: url,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_IMAGE,
    ogUrl: url,
    ogType: "website",
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: DEFAULT_IMAGE,
    bodyHtml,
  };
}

async function storeMeta(slug: string): Promise<SeoMeta> {
  const url = `${BASE_URL}/w/${slug}`;
  try {
    const [wholesaler] = await db
      .select({
        id: users.id,
        businessName: users.businessName,
        storeTagline: users.storeTagline,
        storeDescription: users.storeDescription,
        logoUrl: users.logoUrl,
        city: users.city,
        country: users.country,
        deliveryRegions: users.deliveryRegions,
      })
      .from(users)
      .where(
        and(
          or(eq(users.storeSlug, slug), eq(users.id, slug)),
          eq(users.storeVisibility, "public"),
          eq(users.isInactive, false)
        )
      )
      .limit(1);

    if (!wholesaler) {
      return defaultPublicMeta(url);
    }

    const name = wholesaler.businessName ?? "Wholesale Store";
    const tagline = wholesaler.storeTagline ?? wholesaler.storeDescription ?? null;
    const location =
      [wholesaler.city, wholesaler.country].filter(Boolean).join(", ") || null;

    const titleStr = location
      ? `${name} — Wholesale Store in ${location} | Quikpik`
      : `${name} — Wholesale Store | Quikpik`;

    const description = tagline
      ? truncate(`${tagline} Shop wholesale from ${name} on Quikpik.`, 160)
      : `Browse wholesale products from ${name}${location ? ` in ${location}` : ""}. Request trade pricing and place orders on Quikpik.`;

    const ogImage = wholesaler.logoUrl ?? DEFAULT_IMAGE;

    const bodyHtml = `
<main style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:0.75rem">${escapeHtml(name)}</h1>
  ${location ? `<p style="color:#888;margin-bottom:0.5rem">&#128205; ${escapeHtml(location)}</p>` : ""}
  ${tagline ? `<p style="font-size:1.1rem;color:#333;margin-bottom:1rem">${escapeHtml(tagline)}</p>` : ""}
  <p style="color:#444;margin-bottom:1rem">
    Browse the product catalogue from ${escapeHtml(name)} on Quikpik. Request trade pricing and
    place wholesale orders directly through the platform.
  </p>
  ${wholesaler.deliveryRegions ? `<p style="color:#555">Delivery available to: ${escapeHtml(wholesaler.deliveryRegions)}</p>` : ""}
</main>`.trim();

    const jsonLd = safeJsonLd({
      "@context": "https://schema.org",
      "@type": "Store",
      name,
      description,
      url,
      ...(location && {
        address: {
          "@type": "PostalAddress",
          addressLocality: wholesaler.city ?? "",
          addressCountry: wholesaler.country ?? "",
        },
      }),
    });

    return {
      title: titleStr,
      description,
      canonicalUrl: url,
      ogTitle: titleStr,
      ogDescription: description,
      ogImage,
      ogUrl: url,
      ogType: "website",
      twitterTitle: titleStr,
      twitterDescription: description,
      twitterImage: ogImage,
      jsonLd,
      bodyHtml,
    };
  } catch {
    return defaultPublicMeta(url);
  }
}

async function productMeta(slug: string): Promise<SeoMeta> {
  const url = `${BASE_URL}/product/${slug}`;
  try {
    // Slug format: "{name-slugified}-{productId}" or just "{productId}"
    const segments = slug.split("-");
    const productId = parseInt(segments[segments.length - 1]!, 10);
    if (isNaN(productId)) return defaultPublicMeta(url);

    // Enforce the same visibility policy as /api/public/products/:slug:
    //   - product must be active
    //   - the selling wholesaler must have a public store and not be inactive
    const [product] = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        imageUrl: products.imageUrl,
        category: products.category,
        wholesalerId: products.wholesalerId,
        moq: products.moq,
        stock: products.stock,
        status: products.status,
      })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.status, "active")))
      .limit(1);

    if (!product) {
      return defaultPublicMeta(url);
    }

    // Only expose metadata if the wholesaler's store is publicly visible
    const [wholesaler] = await db
      .select({
        businessName: users.businessName,
        city: users.city,
        country: users.country,
        storeVisibility: users.storeVisibility,
        isInactive: users.isInactive,
      })
      .from(users)
      .where(
        and(
          eq(users.id, product.wholesalerId ?? ""),
          eq(users.storeVisibility, "public"),
          eq(users.isInactive, false)
        )
      )
      .limit(1);

    // If the selling wholesaler's store is not public, fall back to generic metadata
    if (!wholesaler) {
      return defaultPublicMeta(url);
    }

    const productName = product.name ?? "Wholesale Product";
    const bizName = wholesaler?.businessName ?? "a verified wholesaler";
    const category = product.category ? ` | ${product.category}` : "";
    const location = wholesaler
      ? [wholesaler.city, wholesaler.country].filter(Boolean).join(", ")
      : null;

    const title = `${productName}${category} | ${bizName} on Quikpik`;
    const rawDesc = product.description ? truncate(product.description, 120) : null;
    const description = rawDesc
      ? `${rawDesc} — Available wholesale from ${bizName} on Quikpik.`
      : `Buy ${productName} wholesale from ${bizName}. Request trade pricing and place orders on Quikpik.`;

    const ogImage = product.imageUrl ?? DEFAULT_IMAGE;

    const availability =
      (product.stock ?? 0) <= 0
        ? "Out of Stock"
        : (product.stock ?? 0) < 20
        ? `Low Stock — ${product.stock} units left`
        : "In Stock";

    const bodyHtml = `
<main style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:0.75rem">${escapeHtml(productName)}</h1>
  ${product.category ? `<p style="color:#888;margin-bottom:0.5rem">Category: ${escapeHtml(product.category)}</p>` : ""}
  <p style="color:#888;margin-bottom:0.5rem">Sold by: ${escapeHtml(bizName)}${location ? ` · ${escapeHtml(location)}` : ""}</p>
  <p style="color:#555;margin-bottom:0.75rem">${escapeHtml(availability)}</p>
  ${product.description ? `<p style="color:#444;margin-bottom:1rem">${escapeHtml(product.description)}</p>` : ""}
  <p style="color:#444">
    Available wholesale from ${escapeHtml(bizName)} on Quikpik. Request trade pricing and
    place a wholesale order directly through the platform.
  </p>
</main>`.trim();

    const jsonLd = safeJsonLd({
      "@context": "https://schema.org",
      "@type": "Product",
      name: productName,
      description,
      url,
      ...(product.imageUrl && { image: product.imageUrl }),
      ...(product.category && { category: product.category }),
      seller: { "@type": "Organization", name: bizName },
    });

    return {
      title,
      description,
      canonicalUrl: url,
      ogTitle: title,
      ogDescription: description,
      ogImage,
      ogUrl: url,
      ogType: "product",
      twitterTitle: title,
      twitterDescription: description,
      twitterImage: ogImage,
      jsonLd,
      bodyHtml,
    };
  } catch {
    return defaultPublicMeta(url);
  }
}

async function welcomeMeta(wholesalerId: string): Promise<SeoMeta> {
  const url = `${BASE_URL}/welcome/${wholesalerId}`;
  try {
    const [wholesaler] = await db
      .select({
        businessName: users.businessName,
        storeTagline: users.storeTagline,
        storeDescription: users.storeDescription,
        logoUrl: users.logoUrl,
        city: users.city,
        country: users.country,
      })
      .from(users)
      .where(eq(users.id, wholesalerId))
      .limit(1);

    if (!wholesaler) {
      return defaultPublicMeta(url);
    }

    const name = wholesaler.businessName ?? "a wholesale store";
    const tagline = wholesaler.storeTagline ?? wholesaler.storeDescription ?? null;
    const location =
      [wholesaler.city, wholesaler.country].filter(Boolean).join(", ") || null;

    const title = `You're invited to shop with ${name} | Quikpik`;
    const description = tagline
      ? truncate(`${tagline} Register now to get trade pricing from ${name} on Quikpik.`, 160)
      : `You've been invited to create a trade account with ${name}. Register on Quikpik to access wholesale pricing and place orders.`;
    const ogImage = wholesaler.logoUrl ?? DEFAULT_IMAGE;

    const bodyHtml = `
<main style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <h1 style="font-size:2rem;font-weight:800;color:#111;margin-bottom:0.75rem">
    You've been invited to shop with ${escapeHtml(name)}
  </h1>
  ${location ? `<p style="color:#888;margin-bottom:0.5rem">&#128205; ${escapeHtml(location)}</p>` : ""}
  ${tagline ? `<p style="font-size:1.1rem;color:#333;margin-bottom:1rem">${escapeHtml(tagline)}</p>` : ""}
  <p style="color:#444;margin-bottom:1rem">
    Register your business on Quikpik to access exclusive trade pricing from
    ${escapeHtml(name)} and start placing wholesale orders.
  </p>
  <p style="color:#555">
    Create your account to view the full product catalogue, request trade pricing,
    and manage your orders with ${escapeHtml(name)}.
  </p>
</main>`.trim();

    return {
      title,
      description,
      canonicalUrl: url,
      ogTitle: title,
      ogDescription: description,
      ogImage,
      ogUrl: url,
      ogType: "website",
      twitterTitle: title,
      twitterDescription: description,
      twitterImage: ogImage,
      bodyHtml,
    };
  } catch {
    return defaultPublicMeta(url);
  }
}

function defaultPublicMeta(url: string): SeoMeta {
  const title = "Quikpik — Wholesale Platform";
  const description =
    "Manage orders, customers, products, and revenue — all in one wholesale platform.";
  return {
    title,
    description,
    canonicalUrl: url,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_IMAGE,
    ogUrl: url,
    ogType: "website",
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: DEFAULT_IMAGE,
  };
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Given a request pathname, return the SEO metadata + prerender body content.
 * Falls back to homepage metadata for unknown / authenticated routes.
 */
export async function getRouteMeta(pathname: string): Promise<SeoMeta> {
  const clean = pathname.split("?")[0]!.replace(/\/$/, "") || "/";

  if (clean === "/") return homeMeta();
  if (clean === "/blog") return blogIndexMeta();
  if (clean === "/terms") return termsMeta();
  if (clean === "/privacy") return privacyMeta();

  const blogPostMatch = clean.match(/^\/blog\/([^/]+)$/);
  if (blogPostMatch) return blogPostMeta(blogPostMatch[1]!);

  const storeMatch = clean.match(/^\/w\/([^/]+)$/);
  if (storeMatch) return storeMeta(storeMatch[1]!);

  const productMatch = clean.match(/^\/product\/([^/]+)$/);
  if (productMatch) return productMeta(productMatch[1]!);

  const welcomeMatch = clean.match(/^\/welcome\/([^/]+)$/);
  if (welcomeMatch) return welcomeMeta(welcomeMatch[1]!);

  return defaultPublicMeta(`${BASE_URL}${clean}`);
}

// ---------------------------------------------------------------------------
// HTML injection helper
// ---------------------------------------------------------------------------

/**
 * Inject route-specific metadata tags and prerender body content into
 * an index.html string, replacing the generic placeholder tags.
 */
export function injectMeta(html: string, meta: SeoMeta): string {
  const e = escapeAttr;

  const headTags = [
    `<title>${e(meta.title)}</title>`,
    `<meta name="description" content="${e(meta.description)}" />`,
    `<link rel="canonical" href="${e(meta.canonicalUrl)}" />`,
    `<meta property="og:title" content="${e(meta.ogTitle)}" />`,
    `<meta property="og:description" content="${e(meta.ogDescription)}" />`,
    `<meta property="og:image" content="${e(meta.ogImage)}" />`,
    `<meta property="og:url" content="${e(meta.ogUrl)}" />`,
    `<meta property="og:type" content="${e(meta.ogType)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(meta.twitterTitle)}" />`,
    `<meta name="twitter:description" content="${e(meta.twitterDescription)}" />`,
    `<meta name="twitter:image" content="${e(meta.twitterImage)}" />`,
    meta.jsonLd
      ? `<script type="application/ld+json">${meta.jsonLd}</script>`
      : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  let result = html;

  // Strip existing generic head tags from the template
  result = result.replace(/<title>[^<]*<\/title>/i, "");
  result = result.replace(/<meta\s+name="description"[^>]*>/i, "");
  result = result.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "");
  result = result.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "");
  result = result.replace(/<link\s+rel="canonical"[^>]*>/gi, "");
  result = result.replace(
    /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi,
    ""
  );

  // Inject route-specific head tags after <head>
  result = result.replace(/(<head[^>]*>)/i, `$1\n    ${headTags}`);

  // Inject prerender body content inside <div id="root">
  if (meta.bodyHtml) {
    result = result.replace(
      /(<div\s+id="root"\s*>)\s*(<\/div>)/,
      `$1\n${meta.bodyHtml}\n$2`
    );
  }

  return result;
}
