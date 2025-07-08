import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, MessageSquare, Zap, Shield, Users, TrendingUp, ArrowRight } from "lucide-react";
import { SiTwilio, SiWhatsapp } from "react-icons/si";
import { ContextualHelpBubble } from "./ContextualHelpBubble";
import { whatsappHelpContent } from "@/data/whatsapp-help-content";

interface WhatsAppProviderSelectionProps {
  onSelectProvider: (provider: 'twilio' | 'direct') => void;
  onCancel: () => void;
}

export function WhatsAppProviderSelection({ onSelectProvider, onCancel }: WhatsAppProviderSelectionProps) {
  const [selectedProvider, setSelectedProvider] = useState<'twilio' | 'direct' | null>(null);

  const providers = [
    {
      id: 'twilio' as const,
      name: 'Twilio WhatsApp',
      logo: (
        <div className="w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center">
          <SiTwilio className="w-10 h-10 text-red-600" />
        </div>
      ),
      tagline: "Perfect for getting started quickly",
      description: "Industry-leading platform with easy setup and reliable delivery",
      pricing: "$0.005 - $0.01 per message",
      setupTime: "5 minutes",
      features: [
        "Free sandbox testing environment",
        "5-minute setup process",
        "Excellent documentation & support",
        "Perfect for small to medium businesses",
        "Built-in compliance tools",
        "No monthly fees, pay-per-use"
      ],
      benefits: [
        { icon: Zap, text: "Quick Setup", desc: "Get started in under 5 minutes" },
        { icon: Shield, text: "Reliable", desc: "99.9% uptime guarantee" },
        { icon: Users, text: "Support", desc: "24/7 customer support" }
      ],
      bestFor: "Small to medium businesses starting with WhatsApp messaging",
      pros: [
        "Easiest to set up and configure",
        "Comprehensive sandbox for testing",
        "Strong global delivery rates",
        "No upfront costs or monthly fees"
      ]
    },
    {
      id: 'direct' as const,
      name: 'WhatsApp Business API',
      logo: (
        <div className="w-16 h-16 bg-green-100 rounded-lg flex items-center justify-center">
          <SiWhatsapp className="w-10 h-10 text-green-600" />
        </div>
      ),
      tagline: "Best for high-volume businesses",
      description: "Direct integration with Meta's WhatsApp Business API",
      pricing: "$0.0025 - $0.005 per message",
      setupTime: "15-30 minutes",
      features: [
        "50% lower message costs",
        "Advanced message templates",
        "Rich media support",
        "Better for enterprise scale",
        "Direct Meta integration",
        "Advanced analytics & insights"
      ],
      benefits: [
        { icon: TrendingUp, text: "Cost Efficient", desc: "50% lower message costs" },
        { icon: Shield, text: "Enterprise", desc: "Built for high volume" },
        { icon: MessageSquare, text: "Advanced", desc: "Rich templates & media" }
      ],
      bestFor: "High-volume businesses sending 1000+ messages monthly",
      pros: [
        "Significantly lower per-message costs",
        "Advanced template messaging capabilities",
        "Better rich media support",
        "Direct relationship with Meta/WhatsApp"
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-2xl font-bold text-gray-900">Choose Your WhatsApp Integration</h3>
          <ContextualHelpBubble
            topic="provider selection"
            title="Choosing Your WhatsApp Provider"
            steps={whatsappHelpContent.providerSelection.steps}
            position="bottom"
          />
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Select the WhatsApp integration method that best fits your business needs and messaging volume.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {providers.map((provider) => (
          <Card 
            key={provider.id}
            className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
              selectedProvider === provider.id 
                ? 'ring-2 ring-green-500 shadow-lg' 
                : 'hover:ring-1 hover:ring-gray-300'
            }`}
            onClick={() => setSelectedProvider(provider.id)}
          >
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                {provider.logo}
                {selectedProvider === provider.id && (
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              
              <div>
                <CardTitle className="text-xl">{provider.name}</CardTitle>
                <CardDescription className="text-base mt-1">{provider.tagline}</CardDescription>
              </div>

              <div className="flex gap-2">
                <Badge variant="secondary" className="text-xs">
                  {provider.pricing}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Setup: {provider.setupTime}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">{provider.description}</p>

              {/* Key Benefits */}
              <div className="grid grid-cols-3 gap-3">
                {provider.benefits.map((benefit, index) => (
                  <div key={index} className="text-center">
                    <benefit.icon className="w-6 h-6 mx-auto text-gray-600 mb-1" />
                    <p className="text-xs font-medium text-gray-900">{benefit.text}</p>
                    <p className="text-xs text-gray-500">{benefit.desc}</p>
                  </div>
                ))}
              </div>

              {/* Features List */}
              <div>
                <p className="text-sm font-medium text-gray-900 mb-2">Key Features:</p>
                <div className="grid grid-cols-1 gap-1">
                  {provider.features.slice(0, 4).map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                      <span className="text-xs text-gray-600">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Best For */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-900 mb-1">Best For:</p>
                <p className="text-xs text-gray-600">{provider.bestFor}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Comparison Table */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h4 className="font-semibold text-gray-900 mb-4">Quick Comparison</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-900">Feature</th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">Twilio WhatsApp</th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">WhatsApp Business API</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="py-2 px-3 text-gray-600">Cost per message</td>
                <td className="py-2 px-3">$0.005 - $0.01</td>
                <td className="py-2 px-3 text-green-600 font-medium">$0.0025 - $0.005 (50% savings)</td>
              </tr>
              <tr>
                <td className="py-2 px-3 text-gray-600">Setup time</td>
                <td className="py-2 px-3 text-green-600 font-medium">5 minutes</td>
                <td className="py-2 px-3">15-30 minutes</td>
              </tr>
              <tr>
                <td className="py-2 px-3 text-gray-600">Best for volume</td>
                <td className="py-2 px-3">Up to 1,000 messages/month</td>
                <td className="py-2 px-3 text-green-600 font-medium">1,000+ messages/month</td>
              </tr>
              <tr>
                <td className="py-2 px-3 text-gray-600">Template messaging</td>
                <td className="py-2 px-3">Basic templates</td>
                <td className="py-2 px-3 text-green-600 font-medium">Advanced templates</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-3">
        <Button
          onClick={() => selectedProvider && onSelectProvider(selectedProvider)}
          disabled={!selectedProvider}
          className="bg-green-600 hover:bg-green-700 text-white px-8"
        >
          Continue with {selectedProvider === 'twilio' ? 'Twilio' : selectedProvider === 'direct' ? 'WhatsApp Business API' : 'Selected Option'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-center text-sm text-gray-500">
        <p>Not sure which option to choose? Start with Twilio for easy setup, then upgrade to Direct API as your business grows.</p>
      </div>
    </div>
  );
}