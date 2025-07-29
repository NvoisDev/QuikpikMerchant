import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageSquare, Settings, X, CheckCircle, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

export function WhatsAppSetupAlert() {
  const [dismissed, setDismissed] = useState(false);
  
  // Check WhatsApp integration status
  const { data: whatsappStatus } = useQuery({
    queryKey: ["/api/whatsapp/status"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Don't show if dismissed or WhatsApp is already configured
  if (dismissed || whatsappStatus?.isConfigured) {
    return null;
  }

  return (
    <Alert className="border-orange-200 bg-orange-50 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="p-2 bg-orange-100 rounded-full">
              <MessageSquare className="h-5 w-5 text-orange-600" />
            </div>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-orange-800">WhatsApp Setup Required</h4>
              <Badge variant="outline" className="text-orange-700 border-orange-200">
                Priority
              </Badge>
            </div>
            
            <AlertDescription className="text-orange-700 mb-3">
              Set up WhatsApp messaging to enable customer communications, order notifications, and marketing campaigns. 
              This is essential for your wholesale business operations.
            </AlertDescription>
            
            <div className="flex items-center gap-3">
              <Link href="/settings?tab=integrations">
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
                  <Settings className="h-4 w-4 mr-2" />
                  Set Up WhatsApp
                </Button>
              </Link>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setDismissed(true)}
                className="text-orange-600 border-orange-200 hover:bg-orange-50"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          className="text-orange-600 hover:bg-orange-100 p-1"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  );
}

export function WhatsAppStatusIndicator() {
  const { data: whatsappStatus, isLoading } = useQuery({
    queryKey: ["/api/whatsapp/status"],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      {whatsappStatus?.isConfigured ? (
        <>
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-green-700">WhatsApp Connected</span>
          <Badge variant="outline" className="text-green-700 border-green-200">
            {whatsappStatus.provider === 'twilio' ? 'Twilio' : 'Direct'}
          </Badge>
        </>
      ) : (
        <>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <span className="text-orange-700">WhatsApp Not Set Up</span>
          <Link href="/settings?tab=integrations">
            <Button variant="link" size="sm" className="p-0 h-auto text-orange-600">
              Configure
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}