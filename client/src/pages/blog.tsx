import { useState, useEffect } from "react";
import { Link } from "wouter";
import { blogPosts, BLOG_CATEGORIES } from "@/data/blog-posts";
import { ArrowRight, Clock, Calendar, Search, ChevronRight, BookOpen } from "lucide-react";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      {category}
    </span>
  );
}

function ArticleCard({ post }: { post: typeof blogPosts[0] }) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <article className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer h-full flex flex-col">
        <div className="aspect-[16/9] overflow-hidden bg-gray-100 flex-shrink-0">
          {post.heroImage ? (
            <img
              src={post.heroImage}
              alt={post.title}
              loading="lazy"
              className="w-full h-full object-cover object-left group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
              <BookOpen className="w-12 h-12 text-green-300" />
            </div>
          )}
        </div>
        <div className="p-6 flex flex-col flex-1">
          <div className="flex items-center gap-3 mb-3">
            <CategoryBadge category={post.category} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 leading-snug mb-3 group-hover:text-green-700 transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-gray-500 text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
            {post.excerpt}
          </p>
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
            <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
              {post.author.charAt(0)}
            </div>
            <span>{post.author}</span>
          </div>
          <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(post.publishDate)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {post.readingTime} min read
              </span>
            </div>
            <span className="text-xs font-semibold text-green-600 flex items-center gap-1 group-hover:gap-2 transition-all">
              Read <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function FeaturedArticle({ post }: { post: typeof blogPosts[0] }) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <article className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer">
        <div className="grid lg:grid-cols-2">
          <div className="aspect-[4/3] lg:aspect-auto overflow-hidden bg-gray-100">
            {post.heroImage ? (
              <img
                src={post.heroImage}
                alt={post.title}
                loading="eager"
                className="w-full h-full object-cover object-left group-hover:scale-105 transition-transform duration-500 min-h-[280px]"
              />
            ) : (
              <div className="w-full h-full min-h-[280px] flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
                <BookOpen className="w-20 h-20 text-green-300" />
              </div>
            )}
          </div>
          <div className="p-8 lg:p-12 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-600 text-white">
                Featured
              </span>
              <CategoryBadge category={post.category} />
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-4 group-hover:text-green-700 transition-colors">
              {post.title}
            </h2>
            <p className="text-gray-500 leading-relaxed mb-6">
              {post.excerpt}
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-400 mb-6">
              <span className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {post.author.charAt(0)}
                </div>
                {post.author}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatDate(post.publishDate)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {post.readingTime} min read
              </span>
            </div>
            <div className="flex items-center gap-2 text-green-600 font-semibold text-sm group-hover:gap-3 transition-all">
              Read article <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function BlogPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);

  useEffect(() => {
    const prev = document.title;
    document.title = "Blog — Insights for Modern Wholesalers | Quikpik";

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? "";
    if (metaDesc) {
      metaDesc.setAttribute("content", "Inventory management, invoicing, stock control, payments, and wholesale growth strategies. Expert insights for modern wholesale businesses.");
    }

    const getOrCreate = (selector: string, attrKey: string, attrVal: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      const wasCreated = !el;
      if (wasCreated) {
        el = document.createElement("meta") as HTMLMetaElement;
        el.setAttribute(attrKey, attrVal);
        document.head.appendChild(el);
      }
      return { el: el!, prevContent: el!.getAttribute("content") ?? "", wasCreated };
    };

    const ogTitle = getOrCreate('meta[property="og:title"]', "property", "og:title");
    ogTitle.el.setAttribute("content", "Blog — Insights for Modern Wholesalers | Quikpik");
    const ogDesc = getOrCreate('meta[property="og:description"]', "property", "og:description");
    ogDesc.el.setAttribute("content", "Expert insights for modern wholesale businesses.");
    const ogType = getOrCreate('meta[property="og:type"]', "property", "og:type");
    ogType.el.setAttribute("content", "website");

    const schema = document.createElement("script");
    schema.type = "application/ld+json";
    schema.id = "blog-index-schema";
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Quikpik Blog",
      description: "Expert insights for modern wholesale businesses.",
      url: `${window.location.origin}/blog`,
      publisher: {
        "@type": "Organization",
        name: "Quikpik",
        logo: { "@type": "ImageObject", url: `${window.location.origin}/quikpik-logo.png` },
      },
    });
    document.head.appendChild(schema);

    return () => {
      document.title = prev;
      if (metaDesc) metaDesc.setAttribute("content", prevDesc);
      if (ogTitle.wasCreated) ogTitle.el.remove(); else ogTitle.el.setAttribute("content", ogTitle.prevContent);
      if (ogDesc.wasCreated) ogDesc.el.remove(); else ogDesc.el.setAttribute("content", ogDesc.prevContent);
      if (ogType.wasCreated) ogType.el.remove(); else ogType.el.setAttribute("content", ogType.prevContent);
      document.getElementById("blog-index-schema")?.remove();
    };
  }, []);

  const featuredPost = blogPosts.find(p => p.featured) ?? blogPosts[0];

  const filtered = blogPosts.filter(post => {
    const matchesCategory = activeCategory === "All" || post.category === activeCategory;
    const matchesSearch =
      !searchTerm ||
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const gridPosts = filtered.filter(p => p.id !== featuredPost.id);

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2">
              <img src="/quikpik-logo.png" alt="Quikpik" className="h-7 w-7 object-contain" />
              <span className="font-bold text-gray-900">Quikpik</span>
            </a>
            <span className="hidden sm:block text-gray-300">/</span>
            <span className="hidden sm:block text-gray-600 font-medium text-sm">Blog</span>
          </div>
          <a
            href="/signup"
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Start Free <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-100 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-xs font-semibold px-4 py-2 rounded-full mb-6 border border-green-100">
            <BookOpen className="w-3.5 h-3.5" />
            Wholesale Insights
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight mb-5">
            Insights for<br className="hidden sm:block" />{" "}
            <span className="text-green-600">Modern Wholesalers</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Inventory, invoicing, stock control, payments, customer management and wholesale growth strategies.
          </p>
          {/* Search */}
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search articles…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      </section>

      {/* Category pills */}
      <div className="bg-white border-b border-gray-100 sticky top-16 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-none">
            {BLOG_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat
                    ? "bg-green-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        {/* Featured article */}
        {featuredPost && (activeCategory === "All" || activeCategory === featuredPost.category) && !searchTerm && (
          <section>
            <FeaturedArticle post={featuredPost} />
          </section>
        )}

        {/* Article grid */}
        {gridPosts.length > 0 || (searchTerm || activeCategory !== "All") ? (
          <section>
            {gridPosts.length === 0 && (searchTerm || activeCategory !== "All") && filtered.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-400 mb-1">No articles found</h3>
                <p className="text-gray-400 text-sm">Try a different search or category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {gridPosts.map(post => (
                  <ArticleCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* Newsletter */}
        <section className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-8 sm:p-12 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Stay ahead of the curve</h2>
          <p className="text-green-100 mb-8 max-w-md mx-auto">
            Get the latest wholesale insights, tips, and strategies delivered straight to your inbox.
          </p>
          {newsletterSubmitted ? (
            <div className="flex items-center justify-center gap-2 text-white font-semibold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              You're on the list — thank you!
            </div>
          ) : (
            <form onSubmit={handleNewsletter} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={newsletterEmail}
                onChange={e => setNewsletterEmail(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-white"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-white text-green-700 font-semibold rounded-xl hover:bg-green-50 transition-colors text-sm flex-shrink-0"
              >
                Subscribe
              </button>
            </form>
          )}
          <p className="text-green-200 text-xs mt-4">No spam. Unsubscribe anytime.</p>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold text-gray-700">Quikpik</span>
            <span className="text-gray-300">·</span>
            <span className="text-sm text-gray-400">Wholesale made simple</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <a href="/" className="hover:text-gray-700 transition-colors">Home</a>
            <a href="/blog" className="hover:text-gray-700 transition-colors text-green-600 font-medium">Blog</a>
            <a href="/signup" className="hover:text-gray-700 transition-colors">Get Started</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
