import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MessageSquare, User, Building2, Eye } from "lucide-react";
import { GREEN } from "./shared";

type TemplateChannel = "email" | "whatsapp_sms";
type TemplateRecipient = "customer" | "wholesaler";

interface TemplatePreview {
  key: string;
  name: string;
  description: string;
  channel: TemplateChannel;
  recipient: TemplateRecipient;
  subject?: string;
  html?: string;
  text?: string;
}

const RECIPIENT_LABEL: Record<TemplateRecipient, string> = {
  customer: "Customer",
  wholesaler: "Wholesaler",
};

function RecipientBadge({ recipient }: { recipient: TemplateRecipient }) {
  const isCustomer = recipient === "customer";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
        isCustomer
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
    >
      {isCustomer ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
      {RECIPIENT_LABEL[recipient]}
    </span>
  );
}

function WhatsAppBubble({ text }: { text: string }) {
  return (
    <div className="bg-[#e5ddd5] rounded-xl p-4 sm:p-6 min-h-[300px]">
      <div className="max-w-md mx-auto">
        <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none shadow-sm px-3 py-2 ml-auto">
          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-gray-800 m-0">
            {text}
          </pre>
          <div className="text-[10px] text-gray-500 text-right mt-1">11:30 ✓✓</div>
        </div>
      </div>
    </div>
  );
}

export function TemplatesSection({ isAdmin }: { isAdmin: boolean }) {
  const [channel, setChannel] = useState<TemplateChannel>("email");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ templates: TemplatePreview[] }>({
    queryKey: ["/api/admin/templates"],
    enabled: isAdmin,
    staleTime: 10 * 60 * 1000,
  });

  const templates = data?.templates ?? [];

  const inChannel = useMemo(
    () => templates.filter((t) => t.channel === channel),
    [templates, channel],
  );

  const grouped = useMemo(() => {
    const customer = inChannel.filter((t) => t.recipient === "customer");
    const wholesaler = inChannel.filter((t) => t.recipient === "wholesaler");
    return { customer, wholesaler };
  }, [inChannel]);

  // Keep a valid selection whenever the channel/template list changes.
  useEffect(() => {
    if (inChannel.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !inChannel.some((t) => t.key === selectedKey)) {
      setSelectedKey(inChannel[0]!.key);
    }
  }, [inChannel, selectedKey]);

  const selected = inChannel.find((t) => t.key === selectedKey) || null;

  const emailCount = templates.filter((t) => t.channel === "email").length;
  const waCount = templates.filter((t) => t.channel === "whatsapp_sms").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Message Templates</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Preview every email and WhatsApp/SMS message the platform sends, rendered with sample data. View only — nothing is sent from here.
        </p>
      </div>

      {/* Channel toggle */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          onClick={() => setChannel("email")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            channel === "email" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
          }`}
          data-testid="button-channel-email"
        >
          <Mail className="h-4 w-4" />
          Email
          {!isLoading && <span className="text-xs text-gray-400">({emailCount})</span>}
        </button>
        <button
          onClick={() => setChannel("whatsapp_sms")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            channel === "whatsapp_sms" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
          }`}
          data-testid="button-channel-whatsapp"
        >
          <MessageSquare className="h-4 w-4" />
          WhatsApp &amp; SMS
          {!isLoading && <span className="text-xs text-gray-400">({waCount})</span>}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
          <div className="lg:col-span-2 h-[500px] rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : inChannel.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-500">
            No templates found for this channel.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* List */}
          <div className="space-y-4 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
            {(["customer", "wholesaler"] as TemplateRecipient[]).map((recipient) => {
              const list = grouped[recipient];
              if (list.length === 0) return null;
              return (
                <div key={recipient}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <RecipientBadge recipient={recipient} />
                    <span className="text-xs text-gray-400">{list.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((t) => {
                      const active = t.key === selectedKey;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setSelectedKey(t.key)}
                          className={`w-full text-left rounded-lg border p-3 transition-colors ${
                            active
                              ? "border-transparent ring-2 bg-white"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                          style={active ? { boxShadow: `0 0 0 2px ${GREEN}` } : undefined}
                          data-testid={`template-item-${t.key}`}
                        >
                          <p className="text-sm font-medium text-gray-900 leading-tight">{t.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Preview */}
          <div className="lg:col-span-2">
            {selected ? (
              <Card className="overflow-hidden">
                <div className="border-b border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">{selected.name}</h3>
                        <RecipientBadge recipient={selected.recipient} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{selected.description}</p>
                    </div>
                  </div>
                  {selected.channel === "email" && selected.subject && (
                    <div className="mt-3 rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Subject</span>
                      <p className="text-sm text-gray-800 font-medium">{selected.subject}</p>
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  {selected.channel === "email" ? (
                    <iframe
                      title={`Preview: ${selected.name}`}
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcDoc={selected.html || ""}
                      className="w-full h-[600px] rounded-lg border border-gray-200 bg-white"
                      data-testid="email-preview-frame"
                    />
                  ) : (
                    <WhatsAppBubble text={selected.text || ""} />
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-gray-500">
                  <Eye className="h-5 w-5 mx-auto mb-2 text-gray-300" />
                  Select a template to preview it.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
