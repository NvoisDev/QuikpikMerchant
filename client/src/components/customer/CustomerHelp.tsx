import { useState } from "react";
import { ChevronDown, ChevronRight, ShoppingCart, CreditCard, Truck, Tag, Package, MessageCircle, XCircle, HelpCircle, Phone, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FAQ {
  question: string;
  answer: string;
}

interface HelpSection {
  id: string;
  title: string;
  icon: React.ElementType;
  faqs: FAQ[];
}

const helpSections: HelpSection[] = [
  {
    id: "ordering",
    title: "Placing an Order",
    icon: ShoppingCart,
    faqs: [
      {
        question: "How do I place an order?",
        answer: "Go to the Products tab, browse the catalogue, and click on any product to see more details. Select the quantity you want and add it to your cart. When you're ready, tap the cart icon and go through checkout — you'll enter your delivery address and choose your payment option."
      },
      {
        question: "Is there a minimum order quantity?",
        answer: "Yes, most products have a Minimum Order Quantity (MOQ) shown on the product listing. You'll need to order at least that many units. The MOQ is set by the seller and varies by product."
      },
      {
        question: "Can I order in pallets as well as individual units?",
        answer: "Some products are available in both individual units and full pallets. Where pallets are offered, you'll see both options when viewing the product. Pallet pricing is usually lower per unit."
      },
      {
        question: "What happens after I place an order?",
        answer: "You'll receive a confirmation email and/or SMS right away with your order details. The seller will review and confirm your order. You'll be notified of any status changes. You can check your order status at any time under the Order History tab."
      },
      {
        question: "Can I add a note or special instruction to my order?",
        answer: "Yes — there's a notes field during checkout where you can add any special instructions for the seller."
      }
    ]
  },
  {
    id: "payment",
    title: "Payments & Invoices",
    icon: CreditCard,
    faqs: [
      {
        question: "How do I pay for my order?",
        answer: "You'll be sent a secure payment link via email (or shown one at checkout) to pay by card. Payment is processed securely through Stripe — the seller never sees your card details."
      },
      {
        question: "What is a deposit payment?",
        answer: "Some sellers offer a split-payment option where you pay a deposit upfront (e.g. 30%) and the remaining balance before or on delivery. If this applies to your order, your payment link will show clearly what amount is due now and what balance remains."
      },
      {
        question: "I see a 'Pay Later' label on my order — what does that mean?",
        answer: "Pay Later means the seller has agreed to let you pay after delivery or at a later date. No card payment link will be sent for these orders — you'll arrange payment directly with the seller."
      },
      {
        question: "Will I receive an invoice?",
        answer: "Yes. A detailed invoice is sent to your email address automatically after payment is received. It includes all items, quantities, prices, and your payment breakdown."
      },
      {
        question: "I've paid the deposit — when do I pay the balance?",
        answer: "The seller will send you a separate balance payment link when the remaining amount is due. You'll receive this by email. You can also check your outstanding balance under Order History."
      },
      {
        question: "Is my payment secure?",
        answer: "Yes. All payments are processed by Stripe, a globally trusted payment provider. Your card details are never stored or seen by the seller. All transactions are encrypted."
      },
      {
        question: "Why is there a transaction fee on my order?",
        answer: "A transaction fee of 5.5% + £0.50 is added to every card payment to cover the cost of secure payment processing and platform services. This is calculated on your order subtotal (including any delivery charge) and is shown clearly before you complete checkout."
      },
      {
        question: "Where can I see the transaction fee before I pay?",
        answer: "The fee is shown as a separate line item in your cart summary, labelled 'Transaction Fee (5.5% + £0.50)', before you proceed to payment. The final total you see already includes this charge — there are no hidden costs added afterwards."
      }
    ]
  },
  {
    id: "delivery",
    title: "Delivery & Collection",
    icon: Truck,
    faqs: [
      {
        question: "How do I choose delivery or collection?",
        answer: "During checkout, you'll be asked to choose between Delivery (to your address) or Collection (you pick up from the seller). Make sure to select one — this affects your order total and the seller's preparation."
      },
      {
        question: "How much does delivery cost?",
        answer: "Delivery cost is set by the seller and shown during checkout before you complete your order. Some sellers offer free delivery above a certain order value."
      },
      {
        question: "How long does delivery take?",
        answer: "Delivery times vary by seller. Contact the seller directly for lead times specific to your order. The seller's contact details are shown on the Home tab."
      },
      {
        question: "Can I change my delivery address after ordering?",
        answer: "Contact the seller as soon as possible to request a change. You can use the contact details on the Home tab. Address changes may not be possible once an order is packed or dispatched."
      },
      {
        question: "What if I miss my delivery?",
        answer: "Contact the seller using the phone number or email shown on the Home tab. They'll be able to arrange a re-delivery or advise on collection."
      }
    ]
  },
  {
    id: "promotions",
    title: "Sale Prices & Promotions",
    icon: Tag,
    faqs: [
      {
        question: "What do the coloured badges on products mean?",
        answer: "Coloured badges indicate active promotions: Red = percentage discount off the regular price; Green = a fixed promotional price has been set; Purple = buy X get Y free deal; Blue = bundle deal; Orange = clearance pricing. The original price is shown with a strikethrough next to the promotional price."
      },
      {
        question: "Are promotional prices applied automatically?",
        answer: "Yes — promotional prices are applied automatically when you add a qualifying product to your cart. You'll see the discounted price and any applicable free items reflected at checkout."
      },
      {
        question: "How does a Buy X Get Y Free promotion work?",
        answer: "When you add the qualifying quantity of a product, any free units are automatically included in your cart and shown clearly at checkout. You won't be charged for the free items."
      },
      {
        question: "Can I use a promo and still negotiate a price?",
        answer: "If a product allows price negotiation (you'll see a 'Make an Offer' option), you can still request a custom price. The seller will review your offer and respond."
      }
    ]
  },
  {
    id: "orders",
    title: "Order History & Tracking",
    icon: Package,
    faqs: [
      {
        question: "Where can I see my past orders?",
        answer: "Go to the Order History tab. All your orders are listed there with their current status, items, and amounts."
      },
      {
        question: "What do the order statuses mean?",
        answer: "Pending — your order has been placed and is waiting for the seller to review. Confirmed — the seller has accepted your order. Processing — the order is being prepared. Shipped — your order is on its way. Delivered — your order has been received. Cancelled — the order has been cancelled."
      },
      {
        question: "Can I reorder something I've bought before?",
        answer: "Yes — in your Order History, open a previous order and tap the reorder button to add the same items to your cart again quickly."
      },
      {
        question: "I can't see my order in Order History — what do I do?",
        answer: "Make sure you're logged in with the same phone number you used when placing the order. If the order was placed as a guest or with a different number, contact the seller directly."
      }
    ]
  },
  {
    id: "cancellations",
    title: "Cancellations & Refunds",
    icon: XCircle,
    faqs: [
      {
        question: "Can I cancel my order?",
        answer: "You can request a cancellation from your Order History within 24 hours of placing the order. Open the order and tap 'Request Cancellation'. The seller will review your request and respond."
      },
      {
        question: "What happens after I request a cancellation?",
        answer: "The seller reviews your request and either approves or declines it. You'll receive an email and/or SMS letting you know the outcome."
      },
      {
        question: "How long does a refund take?",
        answer: "If your cancellation is approved and a card refund is processed, it typically takes 5–10 business days to appear on your statement, depending on your bank."
      },
      {
        question: "What if only some of my items are being returned?",
        answer: "The seller can process a partial return — only the returned items are refunded. The remaining items on your order stay active. You'll receive an itemised email showing exactly what was returned and what was refunded."
      },
      {
        question: "I see 'Refund Pending' on my order — is that normal?",
        answer: "Yes. After the seller submits the refund to our payment provider, it can take a short time (usually minutes to a few hours) to be fully confirmed. Once confirmed, the status updates automatically."
      },
      {
        question: "The seller declined my cancellation request — what can I do?",
        answer: "If you disagree with the decision, contact the seller directly to discuss. Their phone number and email are shown on the Home tab of this store."
      }
    ]
  },
  {
    id: "account",
    title: "Your Account",
    icon: MessageCircle,
    faqs: [
      {
        question: "How do I log in?",
        answer: "Enter your full registered phone number, including country code when needed. You'll receive a 6-digit verification code by SMS — enter that to log in. No password needed."
      },
      {
        question: "My verification code isn't arriving — what should I do?",
        answer: "Check that your phone number is correct. If the code still doesn't arrive after a minute, try requesting a new one. Make sure your number can receive SMS messages. If problems persist, contact the seller."
      },
      {
        question: "Can I update my contact details?",
        answer: "You can update your name and email address from the Account tab. To change your phone number, contact the seller directly as it's linked to your account login."
      },
      {
        question: "I'm registered with more than one seller — do I need to log in separately?",
        answer: "No. Once you've verified your phone number, your session works across all sellers you're registered with. You can switch between stores without re-entering your code."
      },
      {
        question: "How do I find or switch sellers?",
        answer: "Use seller selection to search for available stores. If you're already approved by a seller, you can open their store and shop. If you're not approved yet, you can browse as a guest where enabled or request access from that seller."
      },
      {
        question: "What can I see when browsing as a guest?",
        answer: "Guest browsing lets you view product information where the seller allows it, but prices and ordering stay locked until the seller approves your access. This protects each seller's wholesale pricing and customer terms."
      },
      {
        question: "Why does it say I'm not registered when I try to purchase?",
        answer: "You need to be added to this seller's customer list before you can see prices or place orders. Use Request Access where available, or contact the seller directly. They'll review your request and notify you when you can start purchasing."
      }
    ]
  }
];

interface CustomerHelpProps {
  wholesaler?: {
    businessName?: string;
    phoneNumber?: string;
    businessPhone?: string;
    email?: string;
  };
}

export default function CustomerHelp({ wholesaler }: CustomerHelpProps) {
  const [selectedSection, setSelectedSection] = useState(helpSections[0].id);
  const [expandedFaqs, setExpandedFaqs] = useState<Record<string, boolean>>({});

  const toggleFaq = (key: string) => {
    setExpandedFaqs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const currentSection = helpSections.find(s => s.id === selectedSection);
  const contactPhone = wholesaler?.businessPhone || wholesaler?.phoneNumber;
  const contactEmail = wholesaler?.email;
  const businessName = wholesaler?.businessName || "the seller";

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
          <HelpCircle className="w-6 h-6 text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Help & FAQs</h1>
        <p className="text-sm text-gray-500 mt-1">Answers to common questions about ordering from {businessName}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {helpSections.map(section => {
          const Icon = section.icon;
          const isActive = selectedSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => setSelectedSection(section.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition-all flex-shrink-0 ${
                isActive
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {section.title}
            </button>
          );
        })}
      </div>

      {currentSection && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <currentSection.icon className="w-4 h-4 text-green-600" />
              {currentSection.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentSection.faqs.map((faq, index) => {
              const key = `${currentSection.id}-${index}`;
              const isOpen = !!expandedFaqs[key];
              return (
                <div key={key} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                    onClick={() => toggleFaq(key)}
                  >
                    <span className="text-sm font-medium text-gray-900 pr-4">{faq.question}</span>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    }
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 bg-gray-50 border-t">
                      <p className="text-sm text-gray-700 pt-3 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {(contactPhone || contactEmail) && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Still need help?</h3>
            <p className="text-xs text-gray-600 mb-3">Contact {businessName} directly.</p>
            <div className="flex flex-col gap-2">
              {contactPhone && (
                <a href={`tel:${contactPhone}`} className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900">
                  <Phone className="w-4 h-4" />
                  {contactPhone}
                </a>
              )}
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900">
                  <Mail className="w-4 h-4" />
                  {contactEmail}
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
