import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { SiWhatsapp, SiFacebook } from 'react-icons/si';

interface WhatsAppSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (credentials: {
    accessToken: string;
    businessPhoneId: string;
    businessName?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

export function WhatsAppSetupModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isSubmitting = false 
}: WhatsAppSetupModalProps) {
  const [accessToken, setAccessToken] = useState('');
  const [businessPhoneId, setBusinessPhoneId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [currentStep, setCurrentStep] = useState<'instructions' | 'credentials'>('instructions');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !businessPhoneId) return;

    await onSubmit({
      accessToken,
      businessPhoneId,
      businessName: businessName || undefined
    });
  };

  const resetModal = () => {
    setAccessToken('');
    setBusinessPhoneId('');
    setBusinessName('');
    setCurrentStep('instructions');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <SiWhatsapp className="h-6 w-6 text-green-600" />
              <SiFacebook className="h-5 w-5 text-blue-600" />
            </div>
            Connect WhatsApp Business API
            <Badge variant="outline" className="text-green-700 border-green-200">
              Meta Official
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {currentStep === 'instructions' ? (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-900 mb-2">Why WhatsApp Business API?</h4>
                  <ul className="text-green-800 text-sm space-y-1">
                    <li>• Send real WhatsApp messages to your customers</li>
                    <li>• Official Meta integration with your own credentials</li>
                    <li>• Professional messaging from your verified business account</li>
                    <li>• Complete control over your WhatsApp communications</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 text-lg">Setup Instructions:</h4>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 mb-1">Go to Meta Business Manager</p>
                    <p className="text-gray-600 text-sm mb-2">Create or access your business account</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => window.open('https://business.facebook.com', '_blank')}
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open Meta Business Manager
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm mt-0.5">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 mb-1">Select your WhatsApp Business Account</p>
                    <p className="text-gray-600 text-sm">Choose the WhatsApp Business account you want to connect</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm mt-0.5">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 mb-1">Generate Access Token</p>
                    <p className="text-gray-600 text-sm mb-2">Go to System Users → Generate New Token</p>
                    <p className="text-sm text-orange-700 bg-orange-50 p-2 rounded">
                      <strong>Important:</strong> Grant "whatsapp_business_messaging" permissions
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm mt-0.5">
                    4
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 mb-1">Get Phone Number ID</p>
                    <p className="text-gray-600 text-sm mb-2">Go to WhatsApp Manager → Phone Numbers</p>
                    <p className="text-sm text-blue-700 bg-blue-50 p-2 rounded">
                      Copy the <strong>Phone Number ID</strong> (not the actual phone number)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h5 className="font-medium text-yellow-900 mb-1">Before You Continue</h5>
                    <p className="text-yellow-800 text-sm">
                      Make sure your WhatsApp Business account is approved by Meta for sending messages. 
                      This usually requires business verification and compliance review.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setCurrentStep('credentials')}>
                I Have My Credentials
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accessToken" className="text-sm font-medium">
                  WhatsApp Business API Access Token *
                </Label>
                <Textarea
                  id="accessToken"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Paste your access token here..."
                  required
                  className="min-h-[100px] resize-none"
                />
                <p className="text-xs text-gray-500">
                  This token starts with "EAA..." and is generated from Meta Business Manager
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessPhoneId" className="text-sm font-medium">
                  WhatsApp Business Phone Number ID *
                </Label>
                <Input
                  id="businessPhoneId"
                  value={businessPhoneId}
                  onChange={(e) => setBusinessPhoneId(e.target.value)}
                  placeholder="e.g., 123456789012345"
                  required
                />
                <p className="text-xs text-gray-500">
                  This is the Phone Number ID from WhatsApp Manager, not your actual phone number
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName" className="text-sm font-medium">
                  WhatsApp Business Display Name (Optional)
                </Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your Business Name"
                />
                <p className="text-xs text-gray-500">
                  This name will appear in WhatsApp messages sent to customers
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h5 className="font-medium text-blue-900 mb-1">Security & Privacy</h5>
                  <p className="text-blue-800 text-sm">
                    Your credentials are encrypted and stored securely. We only use them to send 
                    WhatsApp messages on your behalf when you create campaigns or notify customers.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setCurrentStep('instructions')}
                disabled={isSubmitting}
              >
                Back to Instructions
              </Button>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={!accessToken || !businessPhoneId || isSubmitting}
                  className="flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <SiWhatsapp className="h-4 w-4" />
                      Connect WhatsApp
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}