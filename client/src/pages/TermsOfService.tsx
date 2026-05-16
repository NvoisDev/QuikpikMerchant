import { Link } from "wouter";
import logoSrc from "@assets/Quikpik_1773118173684.png";
import heroSrc from "@assets/ChatGPT_Image_May_16,_2026,_10_26_58_PM_1778966955145.png";

const GREEN = "#1a7a3d";

const sections = [
  {
    num: "1",
    title: "About Quikpik",
    body: "Quikpik is a wholesale ordering and business management platform that helps wholesalers manage products, orders, invoices, inventory, customer communication, payments, and related business operations.",
  },
  {
    num: "2",
    title: "Using the Platform",
    body: null,
    list: [
      "Provide accurate business information",
      "Keep your login details secure",
      "Use the platform lawfully",
      "Not misuse, copy, or interfere with the platform",
    ],
    footer: "You are responsible for all activity under your account.",
  },
  {
    num: "3",
    title: "Orders & Invoices",
    body: "Quikpik provides tools for creating and managing invoices, orders, stock, and customer communications. Businesses are responsible for:",
    list: [
      "Ensuring pricing is accurate",
      "Managing their inventory correctly",
      "Reviewing invoices before sending",
      "Complying with tax and legal obligations",
    ],
    footer: "Quikpik is not responsible for disputes between wholesalers and customers.",
  },
  {
    num: "4",
    title: "Payments",
    body: "Where payments are processed through third-party providers (such as Stripe), those providers' terms also apply. Quikpik does not store full payment card details.",
  },
  {
    num: "5",
    title: "Messaging & Notifications",
    body: "The platform may send emails, SMS, or WhatsApp notifications based on your settings and actions taken within the platform.",
    footer: "You are responsible for ensuring communications sent through Quikpik comply with applicable laws and customer consent requirements.",
  },
  {
    num: "6",
    title: "Data & Privacy",
    body: "Your use of the platform is also governed by our Privacy Policy. We take reasonable measures to protect your data, but no online system can guarantee absolute security.",
  },
  {
    num: "7",
    title: "Availability",
    body: "We aim to keep Quikpik available and reliable, but we do not guarantee uninterrupted access at all times. Features may change, improve, or be removed over time.",
  },
  {
    num: "8",
    title: "Limitation of Liability",
    body: 'Quikpik is provided "as is." To the maximum extent permitted by law, Quikpik is not liable for:',
    list: [
      "Loss of profits",
      "Business interruption",
      "Data loss",
      "Indirect or consequential damages",
    ],
  },
  {
    num: "9",
    title: "Suspension or Termination",
    body: "We may suspend or terminate accounts that:",
    list: [
      "Breach these terms",
      "Misuse the platform",
      "Attempt fraudulent or harmful activity",
    ],
    footer: "You may stop using the platform at any time.",
  },
  {
    num: "10",
    title: "Changes to These Terms",
    body: "We may update these Terms occasionally. Continued use of Quikpik after updates means you accept the revised terms.",
  },
  {
    num: "11",
    title: "Contact",
    body: null,
    contactLink: true,
  },
];

export default function TermsOfService() {
  return (
    <>
      <title>Terms of Service — Quikpik</title>
      <meta name="description" content="Read the Quikpik Terms of Service. Understand your rights, responsibilities, and our policies when using the Quikpik wholesale platform." />

      <div className="min-h-screen bg-white">
        {/* Top bar */}
        <div className="h-1.5 w-full" style={{ background: GREEN }} />

        {/* Nav */}
        <header className="border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link href="/">
              <img src={logoSrc} alt="Quikpik" className="h-8 w-auto cursor-pointer" />
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/privacy" className="text-gray-500 hover:text-gray-800 transition-colors">Privacy Policy</Link>
              <Link href="/login" className="font-medium hover:opacity-80 transition-opacity" style={{ color: GREEN }}>Sign in</Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <div className="bg-gray-50 border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: GREEN }}>Legal</p>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-4">Terms of<br />Service</h1>
              <div className="w-12 h-1 rounded-full mb-5 mx-auto sm:mx-0" style={{ background: GREEN }} />
              <p className="text-gray-500 text-base leading-relaxed max-w-md">
                Please read these terms carefully before using Quikpik. They set out your rights and responsibilities.
              </p>
              <p className="text-xs text-gray-400 mt-4">Last updated: August 2026</p>
            </div>
            <div className="flex-shrink-0 w-56 sm:w-72">
              <img
                src={heroSrc}
                alt="Terms of Service"
                className="w-full rounded-2xl shadow-lg object-cover"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="space-y-10">
            {sections.map((s) => (
              <section key={s.num} id={`section-${s.num}`} className="scroll-mt-20">
                <div className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5" style={{ background: GREEN }}>
                    {s.num}
                  </span>
                  <h2 className="text-lg font-bold text-gray-900 leading-snug">{s.title}</h2>
                </div>
                <div className="pl-10 space-y-3">
                  {s.body && <p className="text-gray-600 leading-relaxed text-sm sm:text-base">{s.body}</p>}
                  {s.list && (
                    <ul className="space-y-1.5">
                      {s.list.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-gray-600 text-sm sm:text-base">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: GREEN }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.footer && <p className="text-gray-600 leading-relaxed text-sm sm:text-base">{s.footer}</p>}
                  {s.contactLink && (
                    <p className="text-gray-600 text-sm sm:text-base">
                      For support or questions, contact us through{" "}
                      <a href="https://quikpik.app" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: GREEN }}>Quikpik.app</a>.
                    </p>
                  )}
                </div>
                <div className="mt-8 border-b border-gray-100" />
              </section>
            ))}
          </div>

          {/* Footer links */}
          <div className="mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
            <p>© {new Date().getFullYear()} Quikpik. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
              <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
