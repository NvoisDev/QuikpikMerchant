import { useState, useEffect } from 'react';
import { MessageSquare, X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TemporaryAdvertisingBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Generate a random 6-digit verification code that changes every 5 minutes
  const [verificationCode, setVerificationCode] = useState('');
  
  useEffect(() => {
    const generateCode = () => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setVerificationCode(code);
    };
    
    generateCode();
    const interval = setInterval(generateCode, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(interval);
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(verificationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = verificationCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isDismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <MessageSquare className="h-6 w-6" />
            <div>
              <h3 className="font-semibold text-lg">SMS Verification Code</h3>
              <p className="text-sm opacity-90">
                Use this code to complete your login authentication
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 backdrop-blur rounded-lg px-4 py-2 flex items-center space-x-3">
              <div>
                <div className="text-xs opacity-80 mb-1">Verification Code:</div>
                <div className="text-2xl font-mono font-bold tracking-wider">
                  {verificationCode}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyCode}
                className="text-white hover:bg-white/10 p-2"
                title="Copy code"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDismissed(true)}
              className="text-white/80 hover:text-white hover:bg-white/10 p-2"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="mt-3 text-sm opacity-80">
          💡 Copy this code and paste it into the SMS verification field on your login screen. Code refreshes every 5 minutes.
        </div>
      </div>
    </div>
  );
}