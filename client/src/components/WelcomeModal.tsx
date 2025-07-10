import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Rocket, Calendar, Mail, X } from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  const [welcomeMessage, setWelcomeMessage] = useState<any>(null);

  useEffect(() => {
    const storedMessage = sessionStorage.getItem('welcomeMessage');
    if (storedMessage) {
      try {
        setWelcomeMessage(JSON.parse(storedMessage));
      } catch (error) {
        console.error('Failed to parse welcome message:', error);
      }
    }
  }, []);

  const handleClose = () => {
    // Clear the welcome message from session storage
    sessionStorage.removeItem('welcomeMessage');
    onClose();
  };

  if (!welcomeMessage) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <Rocket className="h-4 w-4 text-white" />
              </div>
              <DialogTitle className="text-xl font-bold text-primary">
                {welcomeMessage.title}
              </DialogTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription className="text-base leading-relaxed">
            {welcomeMessage.content}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Platform Features */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>What You Can Do Right Now</span>
            </h3>
            <div className="grid gap-2">
              {welcomeMessage.platformGoals?.map((goal: string, index: number) => (
                <div key={index} className="flex items-center space-x-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span>{goal}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Future Features */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <Rocket className="h-5 w-5 text-blue-600" />
              <span>Coming Soon - Advanced Features</span>
            </h3>
            <div className="grid gap-2">
              {welcomeMessage.futureSupport?.map((feature: string, index: number) => (
                <div key={index} className="flex items-center space-x-2 text-sm">
                  <Badge variant="outline" className="text-xs">Future</Badge>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Support Information */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold text-green-800 flex items-center space-x-2">
              <Mail className="h-5 w-5" />
              <span>Get Help & Support</span>
            </h3>
            <div className="space-y-2 text-sm text-green-700">
              <div className="flex items-center space-x-2">
                <span>📧</span>
                <span>Email: support@quikpik.co (2-hour response time)</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>Free 15-minute setup call available</span>
              </div>
              <div className="flex items-center space-x-2">
                <span>💬</span>
                <span>Business hours: Mon-Fri 9AM-6PM GMT</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={handleClose} className="flex-1">
              Get Started with Dashboard
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.open('mailto:support@quikpik.co', '_blank')}
              className="flex-1"
            >
              Contact Support
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}