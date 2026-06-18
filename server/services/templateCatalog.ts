/**
 * Admin Template Catalogue
 * ------------------------
 * Builds read-only previews of every platform message (email + WhatsApp/SMS)
 * rendered with realistic sample data, for the admin "Templates" section.
 *
 * IMPORTANT: This module is preview-only and does NOT send anything. Where a
 * faithful, reusable generator already exists (in email-templates.ts) we call it
 * directly so the preview never drifts. Where a template only lives inside a
 * combined build-and-send function, we reconstruct its body using the SAME
 * shared helpers (wrapCustomerEmail / emailCard / emailTable / ...) with sample
 * data — we never modify the production send paths. If a send template changes,
 * update the matching entry here to keep the preview accurate.
 */

import {
  wrapCustomerEmail,
  emailCard,
  emailHeading,
  emailButton,
  emailBadge,
  emailTable,
  emailDivider,
  generateWholesalerOrderNotificationEmail,
  generateReadyForCollectionEmail,
  buildItemisedRefundEmail,
  generateDowngradeScheduledEmail,
  generateDowngradeEffectiveEmail,
} from "../email-templates";

export type TemplateChannel = "email" | "whatsapp_sms";
export type TemplateRecipient = "customer" | "wholesaler";

export interface TemplatePreview {
  key: string;
  name: string;
  description: string;
  channel: TemplateChannel;
  recipient: TemplateRecipient;
  /** Email subject line (email channel only). */
  subject?: string;
  /** Rendered HTML (email channel only). */
  html?: string;
  /** Rendered plain-text message (WhatsApp/SMS channel only). */
  text?: string;
}

// ---------------------------------------------------------------------------
// Sample data — representative values used across every preview
// ---------------------------------------------------------------------------
const SAMPLE = {
  customerName: "Maria Gomez",
  customerBusiness: "Corner Shop Express",
  customerEmail: "maria@cornershop.example",
  customerPhone: "+44 7700 900123",
  wholesalerName: "Fresh Foods Wholesale",
  wholesalerEmail: "orders@freshfoods.example",
  wholesalerPhone: "+44 7700 900999",
  orderNumber: "ORD-2026-0042",
  portalUrl: "https://quikpik.app/store/fresh-foods",
  storeUrl: "https://quikpik.app/store/fresh-foods",
  orderUrl: "https://quikpik.app/orders/ORD-2026-0042",
  paymentLink: "https://quikpik.app/pay/ORD-2026-0042",
  broadcastTitle: "Summer Stock Clearance",
  broadcastBody: "Big savings across our full range this week — fresh deliveries every morning. Reply to this message or tap your store link to place an order before stock runs out.",
};

const SAMPLE_ITEMS = [
  { productName: "Coca-Cola 330ml", quantity: 24, unitPrice: 0.45, total: 10.8, appliedOfferLabel: "Buy 20 get 4 free", freeItems: 4 },
  { productName: "Walkers Crisps Variety Box", quantity: 10, unitPrice: 3.2, total: 32.0 },
  { productName: "Cadbury Dairy Milk 110g", quantity: 12, unitPrice: 1.1, total: 13.2 },
];

const SAMPLE_SUBTOTAL = 56.0;
const SAMPLE_FEE = 1.5;
const SAMPLE_TOTAL = 57.5;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------
function emailEntry(
  key: string,
  name: string,
  recipient: TemplateRecipient,
  description: string,
  subject: string,
  html: string,
): TemplatePreview {
  return { key, name, recipient, description, channel: "email", subject, html };
}

function waEntry(
  key: string,
  name: string,
  recipient: TemplateRecipient,
  description: string,
  text: string,
): TemplatePreview {
  return { key, name, recipient, description, channel: "whatsapp_sms", text };
}

const customerBranding = { businessName: SAMPLE.wholesalerName };

// ===========================================================================
// EMAIL TEMPLATES
// ===========================================================================
function buildEmailTemplates(): TemplatePreview[] {
  const out: TemplatePreview[] = [];

  // --- Order confirmation (customer) -------------------------------------
  {
    const itemRows = SAMPLE_ITEMS.map((item) => {
      const promoNote = item.appliedOfferLabel ? '<br/><span style="color:#10b981;font-size:12px">🎁 ' + item.appliedOfferLabel + "</span>" : "";
      const freeNote = item.freeItems && item.freeItems > 0 ? ' <span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:8px;font-size:11px">+' + item.freeItems + " free</span>" : "";
      return [item.productName + promoNote + freeNote, `${item.quantity}`, `£${item.unitPrice.toFixed(2)}`, `£${item.total.toFixed(2)}`];
    });
    const body = `<p style="font-size:16px;margin:0 0 8px">Dear ${SAMPLE.customerName},</p><p style="margin:0 0 20px">Thank you for your order. We're pleased to confirm your order has been received and is being processed.</p>${emailCard(`${emailHeading("Order Details")}<p style="margin:0 0 6px"><strong>Order Number:</strong> ${SAMPLE.orderNumber}</p><p style="margin:0 0 6px"><strong>Shipping to:</strong> 14 Market Street, Manchester, M1 2AB</p><p style="margin:0 0 6px"><strong>Estimated Delivery:</strong> 2-3 business days</p>`)}${emailTable(["Product", "Qty", "Unit Price", "Total"], itemRows)}${emailCard(`<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:6px 0"><strong>Subtotal:</strong></td><td style="padding:6px 0;text-align:right;font-weight:600">£${SAMPLE_SUBTOTAL.toFixed(2)}</td></tr><tr><td style="padding:6px 0;color:#6b7280;font-size:14px">Service Fee:</td><td style="padding:6px 0;text-align:right;color:#6b7280;font-size:14px">£${SAMPLE_FEE.toFixed(2)}</td></tr><tr style="border-top:2px solid #e5e7eb"><td style="padding:12px 0 4px;font-size:17px;font-weight:700">Total Paid:</td><td style="padding:12px 0 4px;text-align:right;font-size:17px;font-weight:700;color:#10b981">£${SAMPLE_TOTAL.toFixed(2)}</td></tr></table>`)}${emailCard(`<p style="margin:0;color:#0f766e;font-size:14px"><strong>Stripe Receipt:</strong> You'll receive a separate payment receipt from Stripe at this email address.</p>`, { borderColor: "#a7f3d0", bgColor: "#ecfdf5" })}`;
    out.push(emailEntry("order-confirmation", "Order Confirmation", "customer", "Sent to the customer once their order is paid and received.", `Order Confirmation - ${SAMPLE.orderNumber}`, wrapCustomerEmail(body, customerBranding, { preheader: `Order ${SAMPLE.orderNumber} confirmed` })));
  }

  // --- Order photo notification (customer) -------------------------------
  {
    const photoCount = 3;
    const body = `<p style="font-size:16px;margin:0 0 8px">Dear ${SAMPLE.customerName},</p><p style="margin:0 0 20px">New photos have been added to your order. Here are the details:</p>${emailCard(`${emailHeading("Order Details")}<p style="margin:0 0 6px"><strong>Order Number:</strong> ${SAMPLE.orderNumber}</p><p style="margin:0 0 6px"><strong>Photos Added:</strong> ${photoCount} new photos</p>`)}${emailCard(`<p style="margin:0 0 8px;font-weight:600;color:#0f766e">Your order items have been photographed to document them before collection.</p><p style="margin:0;color:#0f766e;font-size:14px">${photoCount} new photos are now available for you to view.</p>`, { borderColor: "#a7f3d0", bgColor: "#ecfdf5" })}${emailButton("View Order Photos", SAMPLE.orderUrl)}`;
    out.push(emailEntry("order-photo-notification", "Order Photos Added", "customer", "Notifies the customer when the wholesaler adds photos of their order.", `New Photos Added to Order ${SAMPLE.orderNumber}`, wrapCustomerEmail(body, customerBranding, { preheader: `${photoCount} new photos added to order ${SAMPLE.orderNumber}` })));
  }

  // --- New order received (wholesaler) — pure generator ------------------
  {
    const gen = generateWholesalerOrderNotificationEmail({
      orderNumber: SAMPLE.orderNumber,
      customerName: SAMPLE.customerName,
      customerEmail: SAMPLE.customerEmail,
      customerPhone: SAMPLE.customerPhone,
      shippingAddress: "14 Market Street, Manchester, M1 2AB",
      total: "57.50",
      subtotal: "56.00",
      platformFee: "1.96",
      customerTransactionFee: "1.50",
      wholesalerPlatformFee: "1.96",
      fulfillmentType: "delivery",
      items: SAMPLE_ITEMS.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice.toFixed(2), total: i.total.toFixed(2), sellingType: "units", appliedOfferLabel: i.appliedOfferLabel, freeItems: i.freeItems })),
      wholesaler: { businessName: SAMPLE.wholesalerName, firstName: "Sam", lastName: "Patel", email: SAMPLE.wholesalerEmail },
      orderDate: new Date().toISOString(),
    });
    out.push(emailEntry("wholesaler-new-order", "New Order Received", "wholesaler", "Alerts the wholesaler that a new order has been placed.", gen.subject, gen.html));
  }

  // --- Payment reminders (customer) — 3 urgency variants -----------------
  {
    const variants: Array<{ key: string; urgency: "upcoming" | "due_today" | "overdue"; label: string }> = [
      { key: "payment-reminder-upcoming", urgency: "upcoming", label: "Payment Reminder (Upcoming)" },
      { key: "payment-reminder-due-today", urgency: "due_today", label: "Payment Reminder (Due Today)" },
      { key: "payment-reminder-overdue", urgency: "overdue", label: "Payment Reminder (Overdue)" },
    ];
    const amountOutstanding = 28.75;
    const dueDate = "Friday, 26 June 2026";
    for (const v of variants) {
      let urgencyColor: string, urgencyMessage: string, subject: string, headingText: string;
      if (v.urgency === "upcoming") {
        urgencyColor = "#F59E0B";
        urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> is due on <strong>${dueDate}</strong>.`;
        subject = `Payment Reminder: £${amountOutstanding.toFixed(2)} due soon - Order ${SAMPLE.orderNumber}`;
        headingText = "Payment Reminder";
      } else if (v.urgency === "due_today") {
        urgencyColor = "#DC2626";
        urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> is <strong>due today</strong>.`;
        subject = `Payment Due Today: £${amountOutstanding.toFixed(2)} - Order ${SAMPLE.orderNumber}`;
        headingText = "Payment Due Today";
      } else {
        urgencyColor = "#991B1B";
        urgencyMessage = `Your payment of <strong>£${amountOutstanding.toFixed(2)}</strong> was due on <strong>${dueDate}</strong> and is now <strong>overdue</strong>.`;
        subject = `Overdue Payment: £${amountOutstanding.toFixed(2)} - Order ${SAMPLE.orderNumber}`;
        headingText = "Overdue Payment Notice";
      }
      const body = `${emailHeading(headingText, { color: urgencyColor, size: "22px" })}<p style="font-size:16px;margin:0 0 8px">Dear ${SAMPLE.customerName},</p><p style="margin:0 0 20px">${urgencyMessage}</p>${emailCard(`<div style="text-align:center"><p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Amount Due</p><p style="margin:0 0 8px;font-size:32px;font-weight:800;color:${urgencyColor};letter-spacing:-0.5px">£${amountOutstanding.toFixed(2)}</p><p style="margin:0;font-size:14px;color:#6b7280">Order: ${SAMPLE.orderNumber}</p></div>`, { borderColor: urgencyColor })}${emailButton("Pay Now", SAMPLE.paymentLink, "#10b981")}<p style="margin:20px 0 0">Thank you for your continued business.</p><p style="margin:4px 0 0;font-weight:600">${SAMPLE.wholesalerName}</p>`;
      out.push(emailEntry(v.key, v.label, "customer", "Reminds the customer to pay an outstanding balance.", subject, wrapCustomerEmail(body, customerBranding, { preheader: `Payment of £${amountOutstanding.toFixed(2)} ${v.urgency === "overdue" ? "overdue" : "due"} for order ${SAMPLE.orderNumber}` })));
    }
  }

  // --- Stripe payment account verified (wholesaler) ----------------------
  {
    const body = `${emailHeading("Your payment account is verified!", { color: "#10b981", size: "22px" })}<p style="font-size:16px;margin:0 0 8px">Hi ${SAMPLE.wholesalerName},</p><p style="margin:0 0 20px">Great news — Stripe has fully verified your payment account. You can now accept payments from your customers directly through Quikpik.</p>${emailCard(`${emailHeading("What this means for you", { size: "16px", color: "#0f766e" })}<p style="margin:0 0 8px;color:#0f766e">Your Stripe Connect account has been approved and is now active:</p><ul style="margin:0;padding-left:20px;color:#0f766e"><li style="margin-bottom:6px">Customers can pay for orders online</li><li style="margin-bottom:6px">Payments will be transferred directly to your bank account</li><li style="margin-bottom:6px">You can view your payouts from your Quikpik dashboard</li></ul>`, { borderColor: "#a7f3d0", bgColor: "#ecfdf5" })}${emailButton("Go to your Dashboard", "https://quikpik.co/dashboard")}<p style="margin:20px 0 0;color:#6b7280;font-size:14px">If you have any questions, please don't hesitate to get in touch.</p><p style="margin:4px 0 0;font-weight:600">The Quikpik Team</p>`;
    out.push(emailEntry("stripe-verified", "Stripe Account Verified", "wholesaler", "Confirms the wholesaler's Stripe payment account is ready to accept payments.", "Your payment account is verified — you can now accept payments", wrapCustomerEmail(body, { businessName: "Quikpik" }, { preheader: "Your Stripe payment account is now fully verified and ready to accept payments." })));
  }

  // --- Weekly order digest (wholesaler) ----------------------------------
  {
    const orders = [
      { orderNumber: "ORD-2026-0031", customerName: "Maria Gomez", ageDays: 18, status: "Confirmed", total: 124.5 },
      { orderNumber: "ORD-2026-0028", customerName: "John Baker", ageDays: 21, status: "Processing", total: 88.0 },
      { orderNumber: "ORD-2026-0019", customerName: "Aisha Khan", ageDays: 27, status: "Confirmed", total: 240.75 },
    ];
    const orderRows = orders.map((o) => [o.orderNumber, o.customerName, `${o.ageDays} days`, o.status, `£${o.total.toFixed(2)}`]);
    const countWord = `${orders.length} orders`;
    const ordersLink = "https://quikpik.app/orders?status=unfulfilled";
    const body = `${emailHeading("Weekly Order Digest", { color: "#10b981", size: "22px" })}
<p style="font-size:16px;margin:0 0 8px">Hi ${SAMPLE.wholesalerName},</p>
<p style="margin:0 0 20px">You have <strong>${countWord}</strong> that have been unfulfilled for more than 15 days. Here's a summary:</p>
${emailTable(["Order #", "Customer", "Age", "Status", "Value"], orderRows)}
${emailCard(`<p style="margin:0;color:#92400e;font-size:14px">These orders may need your attention. Fulfilling or following up on them promptly helps keep your customers happy.</p>`, { borderColor: "#f59e0b", bgColor: "#fffbeb" })}
${emailButton("View Unfulfilled Orders", ordersLink, "#10b981")}
<p style="margin:20px 0 4px;font-size:13px;color:#6b7280">You're receiving this because you have unfulfilled orders older than 15 days. You can turn off this digest in your <a href="https://quikpik.app/settings?tab=notifications" style="color:#10b981;text-decoration:none">notification settings</a>.</p>`;
    out.push(emailEntry("weekly-order-digest", "Weekly Order Digest", "wholesaler", "Weekly summary of orders left unfulfilled for more than 15 days.", `Weekly Digest: ${countWord} awaiting fulfilment`, wrapCustomerEmail(body, { businessName: SAMPLE.wholesalerName }, { preheader: `You have ${countWord} awaiting fulfilment — ${orders[0].orderNumber} and more` })));
  }

  // --- Trial reminder (wholesaler) ---------------------------------------
  {
    const daysRemaining = 5;
    const formattedDate = "Tuesday, 23 June 2026";
    const urgencyColor = daysRemaining <= 3 ? "#dc2626" : "#d97706";
    const urgencyBg = daysRemaining <= 3 ? "#fef2f2" : "#fffbeb";
    const urgencyBorder = daysRemaining <= 3 ? "#fca5a5" : "#fcd34d";
    const featuresLost = [
      "Full product catalogue (limited to 2 products on free)",
      "Customer portal & online ordering",
      "Invoice & payment processing",
      "WhatsApp marketing & broadcasts",
      "Stock management & low-stock alerts",
      "Order history & business reports",
    ];
    const featureRows = featuresLost.map((f) => `<li style="padding:4px 0;color:#374151;font-size:14px">✓ ${f}</li>`).join("");
    const body = `
    <p style="font-size:16px;margin:0 0 8px">Hi ${SAMPLE.wholesalerName},</p>
    <p style="margin:0 0 20px">Your free 90-day trial is coming to an end. We wanted to give you a heads-up so you're not caught off guard.</p>
    ${emailCard(`${emailHeading(`Your trial ends in ${daysRemaining} days`, { color: urgencyColor })}<p style="margin:0;font-size:15px;color:${urgencyColor}"><strong>Expiry date:</strong> ${formattedDate}</p>`, { borderColor: urgencyBorder, bgColor: urgencyBg })}
    <p style="margin:16px 0 8px;font-weight:600;color:#1f2937">What you'll lose access to after your trial ends:</p>
    <ul style="margin:0 0 20px;padding-left:20px">${featureRows}</ul>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px">To keep your store running smoothly, choose a plan before your trial expires. Plans start from just <strong>£29.99/month</strong>.</p>
    ${emailButton("View Subscription Plans", "https://app.quikpik.co/settings/subscription", "#10b981")}
    ${emailCard(`<p style="margin:0;font-size:13px;color:#6b7280">After your trial ends your account reverts to the free tier — your data is safe and you can upgrade at any time, but order-taking and customer access will be restricted until you subscribe.</p>`, { borderColor: "#e5e7eb", bgColor: "#f9fafb" })}
    <p style="margin:20px 0 0;font-size:14px;color:#6b7280">Questions? Reply to this email or visit <a href="https://quikpik.co" style="color:#10b981">quikpik.co</a> — we're happy to help.</p>
  `;
    out.push(emailEntry("trial-reminder", "Trial Ending Reminder", "wholesaler", "Warns the wholesaler their free trial is about to end.", `Your Quikpik free trial ends in ${daysRemaining} days`, wrapCustomerEmail(body, { businessName: "Quikpik Merchant" }, { preheader: `Your free trial ends in ${daysRemaining} days — don't lose access` })));
  }

  // --- Account suspended (wholesaler) ------------------------------------
  {
    const body = `
    <p style="font-size:16px;margin:0 0 8px">Hi ${SAMPLE.wholesalerName},</p>
    <p style="margin:0 0 20px">We are writing to let you know that your Quikpik account has been <strong>suspended</strong> by the platform administrator.</p>
    ${emailCard(`${emailHeading("What this means", { color: "#dc2626", size: "16px" })}<p style="margin:0 0 8px;color:#92400e">While your account is suspended:</p><ul style="margin:0;padding-left:20px;color:#92400e"><li style="margin-bottom:6px">You will not be able to log in to your Quikpik dashboard</li><li style="margin-bottom:6px">Your customer-facing store will be inaccessible</li><li style="margin-bottom:6px">Your data is safe and will be retained</li></ul>`, { borderColor: "#fca5a5", bgColor: "#fef2f2" })}
    <p style="margin:20px 0 8px">If you believe this is a mistake or would like to discuss your account, please get in touch with us at <a href="mailto:hello@quikpik.co" style="color:#10b981;text-decoration:none">hello@quikpik.co</a>.</p>
    <p style="margin:0 0 0;font-weight:600">The Quikpik Team</p>
  `;
    out.push(emailEntry("wholesaler-suspended", "Account Suspended", "wholesaler", "Notifies the wholesaler that an admin has suspended their account.", "Your Quikpik account has been suspended", wrapCustomerEmail(body, { businessName: "Quikpik" }, { preheader: "Your Quikpik account has been suspended — contact hello@quikpik.co for help" })));
  }

  // --- Account reinstated (wholesaler) -----------------------------------
  {
    const body = `
    <p style="font-size:16px;margin:0 0 8px">Hi ${SAMPLE.wholesalerName},</p>
    <p style="margin:0 0 20px">Great news — your Quikpik account has been <strong>reinstated</strong>. You now have full access to your dashboard and store again.</p>
    ${emailCard(`${emailHeading("Welcome back!", { color: "#10b981", size: "16px" })}<p style="margin:0;color:#0f766e">Everything is back to normal — your customers can place orders and your store is live again. Log in whenever you're ready to pick up where you left off.</p>`, { borderColor: "#a7f3d0", bgColor: "#ecfdf5" })}
    ${emailButton("Go to your Dashboard", "https://quikpik.co/dashboard", "#10b981")}
    <p style="margin:20px 0 8px">If you have any questions, feel free to reach out at <a href="mailto:hello@quikpik.co" style="color:#10b981;text-decoration:none">hello@quikpik.co</a>.</p>
    <p style="margin:0 0 0;font-weight:600">The Quikpik Team</p>
  `;
    out.push(emailEntry("wholesaler-reinstated", "Account Reinstated", "wholesaler", "Tells the wholesaler their suspended account is active again.", "Your Quikpik account has been reinstated", wrapCustomerEmail(body, { businessName: "Quikpik" }, { preheader: "Your Quikpik account is active again — welcome back!" })));
  }

  // --- Welcome email (customer) ------------------------------------------
  {
    const welcomeBody = `${emailHeading("Welcome!", { size: "22px", color: "#10b981" })}<p style="font-size:16px;margin:0 0 8px">Hi ${SAMPLE.customerName},</p><p style="margin:0 0 20px">Your wholesale account has been successfully set up. You now have full access to our catalog, pricing, and seamless ordering system.</p>${emailCard(`${emailHeading("Here's how to get started", { size: "16px" })}<ol style="margin:0;padding-left:20px;font-size:14px"><li style="margin-bottom:8px"><strong>Log in to your portal:</strong> Access your personalised wholesale portal using the button below.</li><li style="margin-bottom:8px"><strong>Explore our products:</strong> Browse our wide range of high-quality products with wholesale pricing.</li><li><strong>Place your first order:</strong> Our simple checkout process makes ordering quick and easy.</li></ol>`, { borderColor: "#a7f3d0", bgColor: "#ecfdf5" })}${emailButton("Access Your Portal", SAMPLE.portalUrl)}${emailCard(`${emailHeading("Need assistance?", { size: "16px" })}<p style="margin:0 0 8px">We're excited to partner with you. If you have any questions or need help, simply reply to this email.</p><p style="margin:0 0 4px"><strong>Contact:</strong> ${SAMPLE.wholesalerName}</p><p style="margin:0"><strong>Email:</strong> ${SAMPLE.wholesalerEmail}</p>`)}<p style="margin:20px 0 0;text-align:center;color:#10b981;font-weight:600">Happy ordering!</p>`;
    out.push(emailEntry("customer-welcome", "Welcome to the Portal", "customer", "Welcomes a new customer once their wholesale portal account is set up.", `Welcome to ${SAMPLE.wholesalerName}! Your Wholesale Portal is Ready`, wrapCustomerEmail(welcomeBody, customerBranding, { preheader: `Welcome to ${SAMPLE.wholesalerName} - your wholesale portal is ready` })));
  }

  // --- Order status update (customer) — representative "shipped" ----------
  {
    const statusLabel = "Shipped";
    const statusColor = "#8b5cf6";
    const trackingNumber = "RM123456789GB";
    const estimatedDelivery = "Thursday, 25 June 2026";
    const itemsSection = emailTable(["Item", "Qty"], [["Coca-Cola 330ml (24 × 330ml)", "24"], ["Walkers Crisps Variety Box", "10"]]);
    const emailBody = `${emailHeading("Order Update", { size: "22px", color: "#10b981" })}<p style="margin:0 0 20px">Hi ${SAMPLE.customerName},</p>${emailCard(`<p style="margin:0 0 8px"><strong>Order:</strong> ${SAMPLE.orderNumber}</p><p style="margin:0 0 8px"><strong>Status:</strong> ${emailBadge(statusLabel, statusColor)}</p><p style="margin:0">Great news! Your order ${SAMPLE.orderNumber} has been shipped.</p><p style="margin:8px 0 0"><strong>Tracking:</strong> ${trackingNumber}</p><p style="margin:8px 0 0"><strong>Estimated Delivery:</strong> ${estimatedDelivery}</p>`)}${itemsSection}`;
    out.push(emailEntry("order-status-update", "Order Status Update", "customer", "Sent to the customer when their order status changes (e.g. confirmed, shipped, delivered).", `Order ${SAMPLE.orderNumber} Shipped`, wrapCustomerEmail(emailBody, customerBranding, { preheader: `Great news! Your order ${SAMPLE.orderNumber} has been shipped.` })));
  }

  // --- Ready for collection / delivery (customer) — pure generator -------
  {
    const pickup = generateReadyForCollectionEmail({
      orderNumber: SAMPLE.orderNumber,
      customerName: SAMPLE.customerName,
      wholesalerName: SAMPLE.wholesalerName,
      businessPhone: SAMPLE.wholesalerPhone,
      businessAddress: "Unit 4, Trafford Park, Manchester, M17 1AB",
      collectionAddressName: "Main Warehouse",
      fulfillmentType: "pickup",
      orderTotal: "57.50",
      readyTime: "Today at 11:30am",
      orderUrl: SAMPLE.orderUrl,
    });
    out.push(emailEntry("ready-for-collection", "Ready for Collection", "customer", "Tells the customer their order is ready to collect.", pickup.subject, pickup.html));

    const delivery = generateReadyForCollectionEmail({
      orderNumber: SAMPLE.orderNumber,
      customerName: SAMPLE.customerName,
      wholesalerName: SAMPLE.wholesalerName,
      businessPhone: SAMPLE.wholesalerPhone,
      deliveryAddress: "14 Market Street, Manchester, M1 2AB",
      fulfillmentType: "delivery",
      orderTotal: "57.50",
      readyTime: "Today at 11:30am",
      orderUrl: SAMPLE.orderUrl,
    });
    out.push(emailEntry("ready-for-delivery", "Ready for Delivery", "customer", "Tells the customer their order is ready and will be dispatched shortly.", delivery.subject, delivery.html));
  }

  // --- Order cancelled / partial return (customer) — pure generator ------
  {
    const fullBody = buildItemisedRefundEmail({
      customerName: SAMPLE.customerName,
      orderNumber: SAMPLE.orderNumber,
      isFullCancellation: true,
      returnedItems: SAMPLE_ITEMS.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, sellingType: "units" })),
      refundAmount: SAMPLE_SUBTOTAL,
      refundStatus: "processed",
      businessName: SAMPLE.wholesalerName,
      businessPhone: SAMPLE.wholesalerPhone,
      businessEmail: SAMPLE.wholesalerEmail,
    });
    out.push(emailEntry("order-cancelled", "Order Cancelled & Refunded", "customer", "Confirms a full order cancellation and the refund breakdown.", `Order ${SAMPLE.orderNumber} Cancelled - ${SAMPLE.wholesalerName}`, wrapCustomerEmail(fullBody, customerBranding, { preheader: `Order ${SAMPLE.orderNumber} has been cancelled` })));

    const partialBody = buildItemisedRefundEmail({
      customerName: SAMPLE.customerName,
      orderNumber: SAMPLE.orderNumber,
      isFullCancellation: false,
      returnedItems: [{ productName: "Coca-Cola 330ml", quantity: 12, unitPrice: 0.45, sellingType: "units" }],
      retainedItems: [{ productName: "Walkers Crisps Variety Box", quantity: 10, unitPrice: 3.2, sellingType: "units" }],
      refundAmount: 5.4,
      refundStatus: "processed",
      businessName: SAMPLE.wholesalerName,
      businessPhone: SAMPLE.wholesalerPhone,
      businessEmail: SAMPLE.wholesalerEmail,
    });
    out.push(emailEntry("partial-return", "Partial Return Processed", "customer", "Confirms a partial return, the items kept, and the refund breakdown.", `Partial Return Processed - Order ${SAMPLE.orderNumber}`, wrapCustomerEmail(partialBody, customerBranding, { preheader: `Partial return for order ${SAMPLE.orderNumber}` })));
  }

  // --- Customer invoice (customer) ---------------------------------------
  {
    const paymentSection = emailCard(`<p style="margin:0 0 8px;font-weight:600;color:#92400e">Outstanding balance: £28.75</p><p style="margin:0;color:#92400e;font-size:14px">You can pay securely online using the link below.</p>${emailButton("Pay Invoice", SAMPLE.paymentLink, "#10b981")}`, { borderColor: "#f59e0b", bgColor: "#fffbeb" });
    const body = emailCard(`<p style="margin:0 0 12px;color:#374151;font-size:15px">Hi ${SAMPLE.customerName},</p><p style="margin:0 0 16px;color:#374151;font-size:15px">${SAMPLE.wholesalerName} is sharing your invoice <strong>${SAMPLE.orderNumber}</strong> with you. Please find it attached to this email.</p>${paymentSection}<p style="margin:16px 0 0;color:#6b7280;font-size:13px">If you have any questions about this invoice, please get in touch with us directly.</p>`);
    out.push(emailEntry("customer-invoice", "Invoice Shared", "customer", "Sends the customer their invoice (PDF attached) with an optional pay link.", `Your Invoice from ${SAMPLE.wholesalerName} – ${SAMPLE.orderNumber}`, wrapCustomerEmail(body, customerBranding, { preheader: `Your invoice ${SAMPLE.orderNumber} from ${SAMPLE.wholesalerName}` })));
  }

  // --- Stock alert (wholesaler) ------------------------------------------
  {
    const urgent = [
      { productName: "Coca-Cola 330ml", currentStock: 3, suggestedReorderQuantity: 100 },
      { productName: "Walkers Crisps Variety Box", currentStock: 5, suggestedReorderQuantity: 100 },
    ];
    const low = [{ productName: "Cadbury Dairy Milk 110g", currentStock: 18, minimumThreshold: 50, suggestedReorderQuantity: 100 }];
    let body = `${emailHeading("Stock Alert", { size: "22px", color: "#dc2626" })}<p style="margin:0 0 20px">We've detected ${urgent.length + low.length} products that need restocking to maintain optimal inventory levels.</p>`;
    body += emailCard(`${emailHeading("URGENT - Critical Stock Levels", { size: "16px", color: "#dc2626" })}<ul style="margin:0;padding-left:20px">${urgent.map((p) => `<li style="margin:8px 0"><strong>${p.productName}</strong> - Only ${p.currentStock} units left<br><small style="color:#6b7280">Suggested reorder: ${p.suggestedReorderQuantity} units</small></li>`).join("")}</ul>`, { borderColor: "#FECACA", bgColor: "#FEF2F2" });
    body += emailCard(`${emailHeading("Low Stock Products", { size: "16px", color: "#f59e0b" })}<ul style="margin:0;padding-left:20px">${low.map((p) => `<li style="margin:8px 0"><strong>${p.productName}</strong> - ${p.currentStock} units (Min: ${p.minimumThreshold})<br><small style="color:#6b7280">Suggested reorder: ${p.suggestedReorderQuantity} units</small></li>`).join("")}</ul>`, { borderColor: "#FDE68A", bgColor: "#FFFBEB" });
    body += emailCard(`${emailHeading("Quick Actions", { size: "16px" })}<ul style="margin:0;padding-left:20px"><li style="margin-bottom:6px">Log into your dashboard to place reorders immediately</li><li style="margin-bottom:6px">Contact your suppliers to ensure timely delivery</li><li>Consider adjusting minimum stock thresholds for better planning</li></ul>`);
    body += emailButton("View Dashboard", "https://quikpik.app/login");
    out.push(emailEntry("stock-alert", "Low Stock Alert", "wholesaler", "Alerts the wholesaler (and team) when products run low or out of stock.", "🚨 Stock Alert: 3 Products Need Restocking", wrapCustomerEmail(body, { businessName: SAMPLE.wholesalerName }, { preheader: "3 products need restocking" })));
  }

  // --- Team invitation (wholesaler / team) -------------------------------
  {
    const inviteUrl = "https://quikpik.app/team/accept/abc123";
    const roleLabel = "Order Manager";
    const accessDescription = "Can view and manage orders, update order status, and contact customers.";
    const inviteBody = `${emailHeading("You're Invited!", { size: "22px", color: "#10b981" })}<p style="font-size:16px;margin:0 0 8px">Hello Alex,</p><p style="margin:0 0 20px"><strong>${SAMPLE.wholesalerName}</strong> has invited you to join their team on Quikpik, the wholesale management platform.</p>${emailCard(`<p style="margin:0 0 6px"><strong>Your Role:</strong> ${emailBadge(roleLabel)}</p><p style="margin:0;color:#6b7280;font-size:14px">${accessDescription}</p>`)}<p style="margin:0 0 4px">This invitation expires in <strong>7 days</strong>. Click the button below to create your account and get started.</p><br>${emailButton("Accept Invitation & Join Team", inviteUrl)}<p style="color:#6b7280;font-size:13px;text-align:center;margin:16px 0 0">Or copy and paste this link in your browser:<br><span style="word-break:break-all">${inviteUrl}</span></p>${emailDivider()}<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">This invitation was sent by <strong>${SAMPLE.wholesalerEmail}</strong>. If you didn't expect this invitation, you can safely ignore this email.</p>`;
    out.push(emailEntry("team-invitation", "Team Invitation", "wholesaler", "Invites a new team member to join the wholesaler's Quikpik account.", `You're invited to join ${SAMPLE.wholesalerName} on Quikpik`, wrapCustomerEmail(inviteBody, { businessName: SAMPLE.wholesalerName }, { preheader: `Join ${SAMPLE.wholesalerName}'s team on Quikpik` })));
  }

  // --- Password reset (wholesaler) ---------------------------------------
  {
    const resetUrl = "https://quikpik.app/reset-password?token=abc123";
    const resetBody = `${emailHeading("Reset Your Password", { size: "22px" })}<p style="font-size:16px;margin:0 0 8px">Hi ${SAMPLE.wholesalerName},</p><p style="margin:0 0 20px">We received a request to reset your password for your Quikpik account. Click the button below to create a new password:</p>${emailButton("Reset Password", resetUrl)}${emailCard(`<p style="margin:0;color:#6b7280;font-size:14px">This link will expire in 1 hour for security purposes. If you didn't request this password reset, you can safely ignore this email.</p>`)}${emailDivider()}<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">If you're having trouble clicking the button, copy and paste this URL into your browser:<br><span style="word-break:break-all">${resetUrl}</span></p>`;
    out.push(emailEntry("password-reset", "Password Reset", "wholesaler", "Lets a wholesaler reset their account password via a secure link.", "Reset Your Quikpik Password", wrapCustomerEmail(resetBody, { businessName: "Quikpik" }, { preheader: "Reset your Quikpik password" })));
  }

  // --- Email verification code (customer) — bespoke HTML ------------------
  {
    const code = "482913";
    const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Quikpik</h1>
      <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Customer Portal Access</p>
    </div>
    <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <h2 style="color: #333; margin: 0 0 20px 0;">Email Verification Required</h2>
      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
        To complete your authentication and access your order history, please verify your email address using the code below:
      </p>
      <div style="background: #f8fafc; border: 2px dashed #667eea; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
        <p style="color: #333; font-size: 14px; margin: 0 0 10px 0;">Your verification code:</p>
        <h1 style="color: #667eea; font-size: 36px; font-weight: bold; margin: 0; letter-spacing: 4px;">${code}</h1>
      </div>
      <p style="color: #888; font-size: 14px; margin: 20px 0 0 0;">
        ⏰ This code will expire in 10 minutes<br>
        🔒 For security, never share this code with anyone
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
        This email was sent from Quikpik Customer Portal. If you didn't request this verification, you can safely ignore this email.
      </p>
    </div>
  </div>`;
    out.push(emailEntry("email-verification", "Email Verification Code", "customer", "Sends a one-time code to verify a customer's email for portal access.", "Verify your email - Quikpik Customer Portal", html));
  }

  // --- Downgrade scheduled / effective (wholesaler) — pure generators ----
  {
    const effectiveDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const scheduled = generateDowngradeScheduledEmail({
      firstName: "Sam",
      email: SAMPLE.wholesalerEmail,
      businessName: SAMPLE.wholesalerName,
      currentPlan: "premium",
      effectiveDate,
      productsToLock: 12,
      totalProducts: 14,
      teamMembersToSuspend: 2,
      groupsToArchive: 3,
    });
    out.push(emailEntry("downgrade-scheduled", "Downgrade Scheduled", "wholesaler", "Confirms a scheduled subscription downgrade and what will change.", scheduled.subject, scheduled.html));

    const effective = generateDowngradeEffectiveEmail({
      firstName: "Sam",
      email: SAMPLE.wholesalerEmail,
      businessName: SAMPLE.wholesalerName,
      productsLocked: 12,
      teamMembersSuspended: 2,
      groupsArchived: 3,
    });
    out.push(emailEntry("downgrade-effective", "Downgrade Now Active", "wholesaler", "Tells the wholesaler their plan has dropped to Free and what changed.", effective.subject, effective.html));
  }

  return out;
}

// ===========================================================================
// WHATSAPP / SMS TEMPLATES
// ===========================================================================
function buildWhatsAppTemplates(): TemplatePreview[] {
  const out: TemplatePreview[] = [];
  const { orderNumber, wholesalerName, customerName, customerBusiness, portalUrl, storeUrl, wholesalerPhone, wholesalerEmail } = SAMPLE;

  // --- Order status updates (customer) -----------------------------------
  out.push(waEntry("wa-order-confirmed", "Order Confirmed", "customer", "WhatsApp/SMS sent when an order is confirmed.", `✅ *Order Confirmed*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour order is being prepared and you'll receive regular updates.`));
  out.push(waEntry("wa-order-processing", "Order Processing", "customer", "WhatsApp/SMS sent when an order is being picked and packed.", `📦 *Order Processing*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour items are being carefully picked and packed.`));
  out.push(waEntry("wa-order-shipped", "Order Shipped", "customer", "WhatsApp/SMS sent when an order has shipped.", `🚚 *Order Shipped*\n\nOrder: ${orderNumber}\nTracking: RM123456789GB\nEstimated delivery: Thursday, 25 June 2026\n\nYour order is on its way!`));
  out.push(waEntry("wa-order-delivered", "Order Delivered", "customer", "WhatsApp/SMS sent when an order has been delivered.", `✅ *Order Delivered*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour order has been delivered! We hope you're satisfied with your purchase.`));
  out.push(waEntry("wa-items-prepared", "Items Prepared", "customer", "WhatsApp/SMS sent when items have been prepared for dispatch/collection.", `✅ *Items Prepared*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour items have been carefully prepared and are ready for dispatch or collection.`));
  out.push(waEntry("wa-ready-pickup", "Ready for Pickup", "customer", "WhatsApp/SMS sent when an order is ready to collect.", `📍 *Ready for Pickup*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour order is ready for collection.`));

  // --- Welcome (customer) ------------------------------------------------
  out.push(waEntry("wa-welcome", "Welcome Message", "customer", "Sent to a new customer when their portal account is created.", `Welcome to ${wholesalerName}!\n\nYour account is ready. Access our store and start ordering here: ${portalUrl}\n\nPowered by Quikpik`));
  out.push(waEntry("sms-welcome", "Welcome Message (SMS)", "customer", "SMS variant of the new-customer welcome message.", `Welcome to ${wholesalerName}!\n\nYour account is ready. Access our store and start ordering here:\n${portalUrl}\n\nPowered by Quikpik`));

  // --- SMS verification code (customer) ----------------------------------
  out.push(waEntry("sms-verification", "Verification Code (SMS)", "customer", "One-time login/verification code sent by SMS.", `Your ${wholesalerName} verification code: 482913`));

  // --- Invoice / pay link (customer) -------------------------------------
  out.push(waEntry("wa-invoice-link", "Invoice & Pay Link", "customer", "WhatsApp message sharing the invoice and secure pay link.", `Hi ${customerName},\n\nYour invoice from ${wholesalerName} is ready.\n\nView & pay securely here:\n${SAMPLE.paymentLink}\n\nSent via Quikpik — secure wholesale ordering platform.`));

  // --- Cancellation (customer) -------------------------------------------
  out.push(waEntry("wa-cancellation-full", "Order Cancelled", "customer", "Notifies the customer their order was fully cancelled and refunded.", `Hi ${customerName}, your order ${orderNumber} with ${wholesalerName} has been cancelled. A refund of £56.00 for 46 item(s) has been processed. Allow 5-10 business days.\n\nContact ${wholesalerName}: ${wholesalerPhone}`));
  out.push(waEntry("wa-cancellation-partial", "Partial Return", "customer", "Notifies the customer that some items were returned and refunded.", `Hi ${customerName}, 12 item(s) returned for order ${orderNumber} with ${wholesalerName}. Refund of £5.40 processed. Allow 5-10 business days.\n\nContact ${wholesalerName}: ${wholesalerPhone}`));
  out.push(waEntry("wa-cancellation-declined", "Cancellation Declined", "customer", "Tells the customer their cancellation request was declined.", `❌ Your cancellation request for order ${orderNumber} has been declined by ${wholesalerName}. Reason: Order has already been dispatched. Please contact the seller for more information.`));

  // --- Stock broadcast updates (customer) --------------------------------
  const contactFooter = `\n\n📞 Contact us:\n${wholesalerName}\n📱 ${wholesalerPhone}\n\n✨ Powered by Quikpik`;
  out.push(waEntry("wa-stock-restocked", "Back In Stock", "customer", "Broadcast telling customers a product is available again.", `📢 *Stock Update Alert*\n\nProduct: *Coca-Cola 330ml*\n\n✅ *BACK IN STOCK*\nGreat news! This product is available again.\n\n📦 Stock: 480 units available\n💰 Price: £0.45\n📦 MOQ: 24 units\n\n🛒 Place your order now!${contactFooter}`));
  out.push(waEntry("wa-stock-low", "Low Stock Alert (Broadcast)", "customer", "Broadcast warning customers a product is running low.", `📢 *Stock Update Alert*\n\nProduct: *Coca-Cola 330ml*\n\n⚠️ *LOW STOCK ALERT*\nOnly 36 units remaining!\n\n💰 Price: £0.45\n📦 MOQ: 24 units\n\n🛒 Order now to secure your stock!${contactFooter}`));
  out.push(waEntry("wa-stock-price", "Price Update (Broadcast)", "customer", "Broadcast announcing a product price change.", `📢 *Stock Update Alert*\n\nProduct: *Coca-Cola 330ml*\n\n💰 *PRICE UPDATE*\nNew price: £0.42\n📦 Stock: 480 units available\n📦 MOQ: 24 units${contactFooter}`));

  // --- Marketing & promotions (customer) ---------------------------------
  out.push(waEntry("wa-marketing-broadcast", "Marketing Broadcast", "customer", "Custom marketing message a wholesaler broadcasts to their customers over WhatsApp/SMS.", `📢 ${SAMPLE.broadcastTitle}\n${SAMPLE.broadcastBody}\nFrom: ${wholesalerName}`));
  out.push(waEntry("wa-promotion-launched", "Product Promotion (On Sale)", "customer", "Sent to customers when a wholesaler launches a product promotion / sale.", `${wholesalerName}: 3 products just went on sale! Shop now: ${storeUrl}`));
  out.push(waEntry("wa-promotion-ending", "Product Promotion (Ending Today)", "customer", "Last-chance reminder sent on the final day of a promotion.", `${wholesalerName}: Last chance — 3 deals end today! Shop: ${storeUrl}`));

  // --- Stock alert (wholesaler) ------------------------------------------
  out.push(waEntry("wa-stock-alert-owner", "Low Stock Alert (Owner)", "wholesaler", "WhatsApp alert to the wholesaler when products run low.", `🚨 *STOCK ALERT*\n\n3 products need restocking:\n\n⚠️ *URGENT (≤5 units):*\n• Coca-Cola 330ml: 3 left\n• Walkers Crisps Variety Box: 5 left\n\n📦 *Products to reorder:*\n• Coca-Cola 330ml: 3/50 units\n• Walkers Crisps Variety Box: 5/50 units\n• Cadbury Dairy Milk 110g: 18/50 units\n\n💡 *Suggested reorder value: £3000*\n\nCheck your dashboard to place reorders quickly.`));

  // --- New order admin alert (wholesaler) --------------------------------
  out.push(waEntry("wa-new-order-admin", "New Order Alert", "wholesaler", "WhatsApp alert to the wholesaler when a new paid order arrives.", `🎉 New Order Received!\n\nWholesale Ref: ${orderNumber}\nCustomer: ${customerName}\nPhone: ${SAMPLE.customerPhone}\nEmail: ${SAMPLE.customerEmail}\nTotal: £57.50\n\nOrder ID: 1042\nStatus: Paid\n\nQuote this reference when communicating with the customer.`));

  return out;
}

/** Returns the full read-only catalogue of platform message previews. */
export function getTemplateCatalog(): TemplatePreview[] {
  return [...buildEmailTemplates(), ...buildWhatsAppTemplates()];
}
