import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageSquare, Send, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function WhatsAppTestPanel() {
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const { toast } = useToast();

  const handleTest = async () => {
    if (!testPhone.trim()) {
      toast({
        title: "Phone Number Required",
        description: "Please enter a phone number to test WhatsApp integration",
        variant: "destructive"
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await apiRequest("POST", "/api/whatsapp/test", {
        testPhoneNumber: testPhone.trim()
      });

      if (response.ok) {
        const result = await response.json();
        setTestResult(result);
        
        if (result.success) {
          toast({
            title: "WhatsApp Test Successful!",
            description: "Test message sent successfully. Check your WhatsApp.",
          });
        } else {
          toast({
            title: "WhatsApp Test Failed",
            description: result.error || "Unknown error occurred",
            variant: "destructive"
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setTestResult({ success: false, error: errorData.error || "Network error" });
        toast({
          title: "Test Failed",
          description: errorData.error || "Failed to send test message",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
      toast({
        title: "Test Error",
        description: "An error occurred while testing WhatsApp integration",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-800">
          <MessageSquare className="h-5 w-5" />
          WhatsApp Integration Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter phone number (e.g., +1234567890)"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="flex-1"
          />
          <Button 
            onClick={handleTest}
            disabled={testing || !testPhone.trim()}
            className="bg-green-600 hover:bg-green-700"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Test WhatsApp
              </>
            )}
          </Button>
        </div>

        {testResult && (
          <Alert className={testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={testResult.success ? "text-green-800" : "text-red-800"}>
                {testResult.success ? (
                  "WhatsApp test message sent successfully! Check your WhatsApp to confirm delivery."
                ) : (
                  `Test failed: ${testResult.error || "Unknown error"}`
                )}
              </AlertDescription>
            </div>
          </Alert>
        )}

        <div className="text-sm text-green-700 space-y-2">
          <p><strong>Note:</strong> For Twilio sandbox testing:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Use the sandbox number: +1 (415) 523-8886</li>
            <li>Send "join [your-sandbox-code]" to the sandbox number first</li>
            <li>Then test with your verified phone number</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}