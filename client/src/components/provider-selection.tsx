import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProviderSelectionProps {
  selectedProvider: 'twilio' | 'direct';
  onProviderChange: (provider: 'twilio' | 'direct') => void;
  twilioConfig: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  directConfig: {
    businessPhoneId: string;
    accessToken: string;
    appId: string;
    businessPhone: string;
    businessName: string;
  };
  onTwilioConfigChange: (config: any) => void;
  onDirectConfigChange: (config: any) => void;
  onSave: () => void;
  onVerify: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isVerifying: boolean;
}

export function ProviderSelection({
  selectedProvider,
  onProviderChange,
  twilioConfig,
  directConfig,
  onTwilioConfigChange,
  onDirectConfigChange,
  onSave,
  onVerify,
  onCancel,
  isSaving,
  isVerifying
}: ProviderSelectionProps) {
  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div>
        <h4 className="font-medium text-gray-800 mb-3">Choose WhatsApp Integration Method</h4>
        <RadioGroup 
          value={selectedProvider} 
          onValueChange={(value) => onProviderChange(value as 'twilio' | 'direct')}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Card className={`cursor-pointer transition-all ${selectedProvider === 'twilio' ? 'ring-2 ring-green-500' : ''}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="twilio" id="twilio" />
                <Label htmlFor="twilio" className="font-semibold cursor-pointer">Twilio WhatsApp</Label>
              </div>
              <CardDescription>Perfect for getting started quickly</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-sm text-gray-600 space-y-1">
                <p>✓ Easy 5-minute setup</p>
                <p>✓ Sandbox testing included</p>
                <p>✓ Good for small businesses</p>
                <p className="text-gray-500">• Cost: ~$0.005-0.01 per message</p>
              </div>
            </CardContent>
          </Card>

          <Card className={`cursor-pointer transition-all ${selectedProvider === 'direct' ? 'ring-2 ring-green-500' : ''}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="direct" id="direct" />
                <Label htmlFor="direct" className="font-semibold cursor-pointer">Direct WhatsApp API</Label>
              </div>
              <CardDescription>Best for high-volume businesses</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-sm text-gray-600 space-y-1">
                <p>✓ 50% lower message costs</p>
                <p>✓ Advanced features & templates</p>
                <p>✓ Better for enterprise scale</p>
                <p className="text-gray-500">• Cost: ~$0.0025-0.005 per message</p>
              </div>
            </CardContent>
          </Card>
        </RadioGroup>
      </div>

      {/* Configuration Forms */}
      <div className="space-y-4">
        {selectedProvider === 'twilio' ? (
          <>
            <h4 className="font-medium text-gray-800">Twilio Configuration</h4>
            <div className="space-y-3">
              <div>
                <Label>Account SID</Label>
                <Input
                  placeholder="AC... (found in your Twilio Console Dashboard)"
                  value={twilioConfig.accountSid}
                  onChange={(e) => onTwilioConfigChange({...twilioConfig, accountSid: e.target.value})}
                />
              </div>
              <div>
                <Label>Auth Token</Label>
                <Input
                  placeholder="Your Twilio Auth Token"
                  type="password"
                  value={twilioConfig.authToken}
                  onChange={(e) => onTwilioConfigChange({...twilioConfig, authToken: e.target.value})}
                />
              </div>
              <div>
                <Label>WhatsApp Phone Number</Label>
                <Input
                  placeholder="+14155238886 (Twilio sandbox number)"
                  value={twilioConfig.phoneNumber}
                  onChange={(e) => onTwilioConfigChange({...twilioConfig, phoneNumber: e.target.value})}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <h4 className="font-medium text-gray-800">Direct WhatsApp Business API Configuration</h4>
            <div className="space-y-3">
              <div>
                <Label>Business Phone Number ID</Label>
                <Input
                  placeholder="Phone Number ID from WhatsApp Business API"
                  value={directConfig.businessPhoneId}
                  onChange={(e) => onDirectConfigChange({...directConfig, businessPhoneId: e.target.value})}
                />
              </div>
              <div>
                <Label>Access Token</Label>
                <Input
                  placeholder="WhatsApp Business API Access Token"
                  type="password"
                  value={directConfig.accessToken}
                  onChange={(e) => onDirectConfigChange({...directConfig, accessToken: e.target.value})}
                />
              </div>
              <div>
                <Label>App ID</Label>
                <Input
                  placeholder="WhatsApp Business App ID"
                  value={directConfig.appId}
                  onChange={(e) => onDirectConfigChange({...directConfig, appId: e.target.value})}
                />
              </div>
              <div>
                <Label>Business Phone Number</Label>
                <Input
                  placeholder="+44XXXXXXXXX (for display purposes)"
                  value={directConfig.businessPhone}
                  onChange={(e) => onDirectConfigChange({...directConfig, businessPhone: e.target.value})}
                />
              </div>
              <div>
                <Label>Business Name</Label>
                <Input
                  placeholder="Your business name for WhatsApp messages"
                  value={directConfig.businessName}
                  onChange={(e) => onDirectConfigChange({...directConfig, businessName: e.target.value})}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button 
          onClick={onSave}
          disabled={isSaving}
          className="bg-green-600 hover:bg-green-700"
        >
          {isSaving ? "Saving..." : "Save Configuration"}
        </Button>
        <Button 
          variant="outline" 
          onClick={onVerify}
          disabled={isVerifying}
        >
          {isVerifying ? "Verifying..." : "Verify Connection"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}