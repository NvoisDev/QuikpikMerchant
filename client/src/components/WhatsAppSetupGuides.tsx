import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, ExternalLink, Copy, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WhatsAppSetupGuidesProps {
  isOpen: boolean;
  onClose: () => void;
  provider: 'twilio' | 'direct' | null;
}

export function WhatsAppSetupGuides({ isOpen, onClose, provider }: WhatsAppSetupGuidesProps) {
  const { toast } = useToast();
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const copyToClipboard = (text: string, stepId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepId);
    toast({
      title: "Copied to clipboard",
      description: "Text has been copied to your clipboard",
    });
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const TwilioGuide = () => (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-blue-800">Twilio WhatsApp Business API</h3>
        </div>
        <p className="text-blue-700 text-sm">
          Set up WhatsApp messaging through Twilio's reliable infrastructure. Perfect for testing and production use.
        </p>
      </div>

      <Tabs defaultValue="sandbox" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sandbox">Testing (Sandbox)</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
        </TabsList>

        <TabsContent value="sandbox" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Free Testing
                </Badge>
                Sandbox Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Create Twilio Account</p>
                    <p className="text-sm text-gray-600 mb-2">Sign up for a free Twilio account</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://www.twilio.com/try-twilio', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Go to Twilio
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Access WhatsApp Sandbox</p>
                    <p className="text-sm text-gray-600 mb-2">Navigate to: Console → Messaging → WhatsApp → Sandbox</p>
                    <div className="bg-gray-50 p-3 rounded border">
                      <p className="text-sm font-mono">Console → Messaging → WhatsApp → Sandbox</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Get Your Credentials</p>
                    <p className="text-sm text-gray-600 mb-2">Copy these from your Twilio Console:</p>
                    <div className="space-y-2">
                      <div className="bg-gray-50 p-3 rounded border">
                        <div className="flex items-center justify-between">
                          <p className="text-sm"><strong>Account SID:</strong> Starts with 'AC'</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard('Go to Console Dashboard to find your Account SID', 'twilio-sid')}
                          >
                            {copiedStep === 'twilio-sid' ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded border">
                        <div className="flex items-center justify-between">
                          <p className="text-sm"><strong>Auth Token:</strong> From Console Dashboard</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard('Go to Console Dashboard to find your Auth Token', 'twilio-token')}
                          >
                            {copiedStep === 'twilio-token' ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded border">
                        <div className="flex items-center justify-between">
                          <p className="text-sm"><strong>WhatsApp Number:</strong> +1 415 523 8886</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard('+14155238886', 'twilio-number')}
                          >
                            {copiedStep === 'twilio-number' ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    4
                  </div>
                  <div>
                    <p className="font-medium">Test Your Setup</p>
                    <p className="text-sm text-gray-600 mb-2">Send yourself a test message to verify the connection</p>
                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <p className="text-sm font-medium text-yellow-800">Sandbox Note</p>
                      </div>
                      <p className="text-sm text-yellow-700">
                        In sandbox mode, you can only send messages to numbers that have joined your sandbox by sending the join code.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  Production Ready
                </Badge>
                Live WhatsApp Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Request WhatsApp Business API Access</p>
                    <p className="text-sm text-gray-600 mb-2">Apply for official WhatsApp Business API through Twilio</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open('https://www.twilio.com/whatsapp', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Apply for WhatsApp API
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Business Verification</p>
                    <p className="text-sm text-gray-600">Complete Facebook Business verification and provide required documentation</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Phone Number Registration</p>
                    <p className="text-sm text-gray-600">Register your business phone number with WhatsApp Business API</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-semibold">
                    4
                  </div>
                  <div>
                    <p className="font-medium">Template Approval</p>
                    <p className="text-sm text-gray-600">Submit message templates for WhatsApp approval before sending to customers</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Production setup typically takes 1-2 weeks for approval. 
                  Start with sandbox mode for immediate testing.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  const DirectGuide = () => (
    <div className="space-y-6">
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-5 w-5 text-green-600" />
          <h3 className="font-semibold text-green-800">WhatsApp Business API (Direct)</h3>
        </div>
        <p className="text-green-700 text-sm">
          Connect directly to WhatsApp Business API for enterprise-level messaging capabilities.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Direct API Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <div>
                <p className="font-medium">Facebook Business Manager</p>
                <p className="text-sm text-gray-600 mb-2">Create a Facebook Business Manager account</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://business.facebook.com/', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Go to Business Manager
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-semibold">
                2
              </div>
              <div>
                <p className="font-medium">WhatsApp Business API Application</p>
                <p className="text-sm text-gray-600 mb-2">Apply for WhatsApp Business API access</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://developers.facebook.com/docs/whatsapp/cloud-api/get-started', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  WhatsApp Cloud API Docs
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-semibold">
                3
              </div>
              <div>
                <p className="font-medium">Business Verification</p>
                <p className="text-sm text-gray-600">Complete business verification process with required documents</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-semibold">
                4
              </div>
              <div>
                <p className="font-medium">Get API Credentials</p>
                <p className="text-sm text-gray-600 mb-2">Obtain your API credentials from Meta Developers Console</p>
                <div className="space-y-2">
                  <div className="bg-gray-50 p-3 rounded border">
                    <p className="text-sm"><strong>Access Token:</strong> From App Dashboard</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded border">
                    <p className="text-sm"><strong>Phone Number ID:</strong> Your WhatsApp Business Phone Number ID</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded border">
                    <p className="text-sm"><strong>Webhook URL:</strong> For receiving message status updates</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 p-4 rounded">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-medium text-orange-800">Enterprise Level</p>
            </div>
            <p className="text-sm text-orange-700">
              Direct WhatsApp Business API is recommended for high-volume businesses with dedicated development resources. 
              Consider Twilio for easier setup and management.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            WhatsApp Setup Guide
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {provider === 'twilio' && <TwilioGuide />}
          {provider === 'direct' && <DirectGuide />}
          {!provider && (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Select a WhatsApp provider to view the setup guide</p>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={onClose}>Close Guide</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}