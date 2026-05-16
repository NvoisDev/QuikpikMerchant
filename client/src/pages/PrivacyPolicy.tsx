import { Link } from "wouter";
import logoSrc from "@assets/Quikpik_1773118173684.png";
import heroSrc from "@assets/ChatGPT_Image_May_16,_2026,_10_28_14_PM_1778966955144.png";

const GREEN = "#1a7a3d";

const sections = [
  {
    num: "1",
    title: "Introduction",
    body: "Quikpik respects your privacy and is committed to protecting your information. This Privacy Policy explains how we collect, use, and store information when you use Quikpik.app.",
  },
  {
    num: "2",
    title: "Information We Collect",
    body: "We may collect:",
    list: [
      "Name and business details",
      "Email address and phone number",
      "Delivery and billing addresses",
      "Product, order, and invoice data",
      "Payment-related information",
      "Device and usage information",
    ],
  },
  {
    num: "3",
    title: "How We Use Information",
    body: "We use your information to:",
    list: [
      "Operate the platform",
      "Process orders and invoices",
      "Send notifications and updates",
      "Improve features and performance",
      "Provide support",
      "Prevent fraud and misuse",
    ],
  },
  {
    num: "4",
    title: "Payments",
    body: "Payments may be processed by third-party payment providers such as Stripe. Payment information is handled according to their security standards and policies.",
  },
  {
    num: "5",
    title: "Communications",
    body: "Quikpik may send:",
    list: [
      "Order notifications",
      "Invoice communications",
      "Account alerts",
      "Operational updates",
    ],
    footer: "Users can manage certain notification preferences within platform settings.",
  },
  {
    num: "6",
    title: "Data Storage & Security",
    body: "We use reasonable technical and organisational measures to protect your data. However, no online service can guarantee complete security.",
  },
  {
    num: "7",
    title: "Sharing Information",
    body: "We do not sell your personal data. We may share limited information with trusted third-party providers required to operate the platform, including payment processors, messaging providers, hosting services, and analytics tools.",
  },
  {
    num: "8",
    title: "Cookies & Analytics",
    body: "Quikpik may use cookies and analytics tools to improve the platform experience and understand usage trends.",
  },
  {
    num: "9",
    title: "Your Rights",
    body: "Depending on your location, you may have rights to:",
    list: [
      "Access your data",
      "Correct inaccurate information",
      "Request deletion of your data",
      "Object to certain processing activities",
    ],
  },
  {
    num: "10",
    title: "Changes to This Policy",
    body: "We may update this Privacy Policy from time to time. Continued use of Quikpik after updates means you accept the revised policy.",
  },
  {
    num: "11",
    title: "Contact",
    body: null,
    contactLink: true,
  },
];

export default function PrivacyPolicy() {
  return (
    <>
      <title>Privacy Policy — Quikpik</title>
      <meta name="description" content="Read the Quikpik Privacy Policy. Learn how we collect, use, and protect your data when you use the Quikpik wholesale platform." />

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
              <Link href="/terms" className="text-gray-500 hover:text-gray-800 transition-colors">Terms of Service</Link>
              <Link href="/login" className="font-medium hover:opacity-80 transition-opacity" style={{ color: GREEN }}>Sign in</Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <div className="bg-gray-50 border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: GREEN }}>Legal</p>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-4">Privacy<br />Policy</h1>
              <div className="w-12 h-1 rounded-full mb-5 mx-auto sm:mx-0" style={{ background: GREEN }} />
              <p className="text-gray-500 text-base leading-relaxed max-w-md">
                Your privacy is important to us. This policy explains what data we collect and how we use it to operate the platform.
              </p>
              <p className="text-xs text-gray-400 mt-4">Last updated: August 2026</p>
            </div>
            <div className="flex-shrink-0 w-56 sm:w-72">
              <img
                src={heroSrc}
                alt="Privacy Policy"
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
                      For questions about privacy or data handling, contact us through{" "}
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
              <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms of Service</Link>
              <Link href="/login" className="hover:text-gray-600 transition-colors">Sign in</Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
