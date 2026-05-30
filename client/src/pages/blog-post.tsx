import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { blogPosts } from "@/data/blog-posts";
import type { ContentBlock } from "@/data/blog-posts";
import { ArrowLeft, Clock, Calendar, BookOpen, ChevronRight, ArrowRight } from "lucide-react";

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

function ContentRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((block, i) => {
        if (block.type === "p") {
          return (
            <p key={i} className="text-gray-700 text-lg leading-relaxed">
              {block.text}
            </p>
          );
        }

        if (block.type === "h2") {
          return (
            <h2
              key={i}
              id={block.id}
              className="text-2xl sm:text-3xl font-bold text-gray-900 pt-6 pb-1 border-t border-gray-100 mt-10 first:border-t-0 first:mt-0 scroll-mt-24"
            >
              {block.text}
            </h2>
          );
        }

        if (block.type === "ul") {
          return (
            <div key={i} className="space-y-2">
              {block.intro && (
                <p className="text-gray-700 text-lg leading-relaxed">{block.intro}</p>
              )}
              <ul className="space-y-2 pl-2">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-3 text-gray-700 text-lg">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (block.type === "ol") {
          return (
            <ol key={i} className="space-y-5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-5">
                  <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
                    {j + 1}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900 text-lg mb-0.5">{item.title}</p>
                    <p className="text-gray-600 leading-relaxed">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "pullquote") {
          return (
            <blockquote
              key={i}
              className="relative pl-6 py-1 my-8 border-l-4 border-green-500"
            >
              <p className="text-xl sm:text-2xl font-semibold text-gray-800 leading-snug italic">
                "{block.text}"
              </p>
            </blockquote>
          );
        }

        if (block.type === "checklist") {
          return (
            <div key={i} className="bg-green-50 border border-green-100 rounded-2xl p-6 sm:p-8 my-8">
              {block.intro && (
                <p className="font-semibold text-gray-900 text-lg mb-4">{block.intro}</p>
              )}
              <ul className="space-y-3">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-3 text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600 flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function TableOfContents({ blocks, activeId }: { blocks: ContentBlock[]; activeId: string }) {
  const headings = blocks.filter(b => b.type === "h2") as Extract<ContentBlock, { type: "h2" }>[];
  if (headings.length === 0) return null;
  return (
    <nav className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Contents</p>
      {headings.map(h => (
        <a
          key={h.id}
          href={`#${h.id}`}
          className={`block text-sm py-1.5 px-3 rounded-lg transition-colors leading-snug ${
            activeId === h.id
              ? "bg-green-50 text-green-700 font-semibold"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const [activeHeadingId, setActiveHeadingId] = useState("");

  const post = useMemo(
    () => blogPosts.find(p => p.slug === params?.slug),
    [params?.slug]
  );

  const relatedPosts = useMemo(() => {
    if (!post) return [];
    return blogPosts.filter(p => p.id !== post.id && p.category === post.category).slice(0, 3);
  }, [post]);

  useEffect(() => {
    if (!post) return;

    const prev = document.title;
    document.title = `${post.title} | Quikpik Blog`;

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

    const desc = getOrCreate('meta[name="description"]', "name", "description");
    desc.el.setAttribute("content", post.excerpt);
    const ogTitle = getOrCreate('meta[property="og:title"]', "property", "og:title");
    ogTitle.el.setAttribute("content", `${post.title} | Quikpik Blog`);
    const ogDesc = getOrCreate('meta[property="og:description"]', "property", "og:description");
    ogDesc.el.setAttribute("content", post.excerpt);
    const ogType = getOrCreate('meta[property="og:type"]', "property", "og:type");
    ogType.el.setAttribute("content", "article");

    const schema = document.createElement("script");
    schema.type = "application/ld+json";
    schema.id = "blog-post-schema";
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt,
      author: { "@type": "Organization", name: post.author },
      publisher: {
        "@type": "Organization",
        name: "Quikpik",
        logo: { "@type": "ImageObject", url: `${window.location.origin}/quikpik-logo.png` },
      },
      datePublished: post.publishDate,
      mainEntityOfPage: { "@type": "WebPage", "@id": window.location.href },
    });
    document.head.appendChild(schema);

    return () => {
      document.title = prev;
      document.getElementById("blog-post-schema")?.remove();
      if (desc.wasCreated) desc.el.remove(); else desc.el.setAttribute("content", desc.prevContent);
      if (ogTitle.wasCreated) ogTitle.el.remove(); else ogTitle.el.setAttribute("content", ogTitle.prevContent);
      if (ogDesc.wasCreated) ogDesc.el.remove(); else ogDesc.el.setAttribute("content", ogDesc.prevContent);
      if (ogType.wasCreated) ogType.el.remove(); else ogType.el.setAttribute("content", ogType.prevContent);
      if (ogImage.wasCreated) ogImage.el.remove(); else ogImage.el.setAttribute("content", ogImage.prevContent);
    };
  }, [post]);

  useEffect(() => {
    if (!post) return;
    const headingIds = post.content
      .filter(b => b.type === "h2")
      .map(b => (b as Extract<ContentBlock, { type: "h2" }>).id);

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActiveHeadingId(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    headingIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [post]);

  if (!post) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Article not found</h1>
          <p className="text-gray-500 mb-6">This article doesn't exist or has been moved.</p>
          <Link href="/blog">
            <button className="inline-flex items-center gap-2 text-green-600 font-semibold hover:underline">
              <ArrowLeft className="w-4 h-4" /> Back to Blog
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/blog">
              <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Blog</span>
              </button>
            </Link>
            <span className="hidden sm:block text-gray-300">·</span>
            <a href="/" className="hidden sm:flex items-center gap-1.5">
              <img src="/quikpik-logo.png" alt="Quikpik" className="h-5 w-5 object-contain" />
              <span className="font-semibold text-gray-700 text-sm">Quikpik</span>
            </a>
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
      <div className="relative bg-gray-900 overflow-hidden">
        <div className="absolute inset-0">
          {post.heroImage ? (
            <img
              src={post.heroImage}
              alt={post.title}
              className="w-full h-full object-cover object-left opacity-40"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-green-900 to-gray-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="flex items-center gap-3 mb-6">
            <CategoryBadge category={post.category} />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6 max-w-3xl">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
            <span className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-xs">
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
        </div>
      </div>

      {/* Article layout */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-16">
          {/* Content */}
          <article className="max-w-[800px]">
            <ContentRenderer blocks={post.content} />

            {/* Author box */}
            <div className="mt-16 pt-8 border-t border-gray-100 flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                {post.author.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-gray-900">{post.author}</p>
                <p className="text-sm text-gray-500">{post.authorTitle} · Quikpik</p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-12 bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-8 text-white text-center">
              <h3 className="text-xl font-bold mb-2">Ready to take control of your inventory?</h3>
              <p className="text-green-100 mb-6 text-sm">
                Join wholesalers already using Quikpik to manage stock, track batches, and grow their business.
              </p>
              <a
                href="/signup"
                className="inline-flex items-center gap-2 bg-white text-green-700 font-semibold px-6 py-3 rounded-xl hover:bg-green-50 transition-colors text-sm"
              >
                Start Free Today <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </article>

          {/* Sidebar TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <TableOfContents blocks={post.content} activeId={activeHeadingId} />
              </div>
            </div>
          </aside>
        </div>

        {/* Related articles */}
        {relatedPosts.length > 0 && (
          <section className="mt-20 pt-12 border-t border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">Related Articles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedPosts.map(related => (
                <Link key={related.id} href={`/blog/${related.slug}`}>
                  <article className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer">
                    <div className="aspect-[16/9] overflow-hidden bg-gray-100">
                      {related.heroImage ? (
                        <img
                          src={related.heroImage}
                          alt={related.title}
                          loading="lazy"
                          className="w-full h-full object-cover object-left group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
                          <BookOpen className="w-8 h-8 text-green-300" />
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <span className="text-xs font-semibold text-green-600 mb-2 block">{related.category}</span>
                      <h3 className="font-bold text-gray-900 text-sm leading-snug mb-3 group-hover:text-green-700 transition-colors line-clamp-2">
                        {related.title}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-green-600 font-semibold group-hover:gap-2 transition-all">
                        Read more <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-gray-50 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-6 w-6 object-contain" />
            <span className="text-sm font-semibold text-gray-700">Quikpik</span>
            <span className="text-gray-300">·</span>
            <span className="text-sm text-gray-400">Wholesale made simple</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <a href="/" className="hover:text-gray-700 transition-colors">Home</a>
            <Link href="/blog"><span className="hover:text-gray-700 transition-colors cursor-pointer">Blog</span></Link>
            <a href="/signup" className="hover:text-gray-700 transition-colors">Get Started</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
