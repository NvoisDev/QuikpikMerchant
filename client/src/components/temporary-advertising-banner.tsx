import { useState } from 'react';
import { Megaphone, X, ExternalLink, BarChart3, Share2, MessageSquare, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function TemporaryAdvertisingBanner() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Megaphone className="h-6 w-6" />
            <div>
              <h3 className="font-semibold text-lg">🚀 Advertising Features Available</h3>
              <p className="text-sm opacity-90">
                Access marketing tools while we resolve the login issue
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-600 border-white/20 hover:bg-white/10"
            >
              {isExpanded ? 'Hide' : 'View Features'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDismissed(true)}
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>Campaign Analytics</span>
                </CardTitle>
                <CardDescription className="text-white/80">
                  Track campaign performance and ROI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Active Campaigns:</span>
                    <Badge variant="secondary">3</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Total Reach:</span>
                    <span>12,450</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Conversion Rate:</span>
                    <span className="text-green-300">4.2%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center space-x-2">
                  <Share2 className="h-5 w-5" />
                  <span>SEO Product Pages</span>
                </CardTitle>
                <CardDescription className="text-white/80">
                  Generate optimized product landing pages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => window.open('/public-product/sample-frozen-foods', '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Sample Page
                  </Button>
                  <div className="text-xs text-white/70">
                    Create SEO-optimized pages for Google visibility
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5" />
                  <span>Social Media Tools</span>
                </CardTitle>
                <CardDescription className="text-white/80">
                  Content creation and scheduling
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-300" />
                    <span>AI Content Generator</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-300" />
                    <span>Hashtag Optimizer</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-300" />
                    <span>Post Scheduler</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-white/20">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-4">
              <span className="opacity-80">Quick Access:</span>
              <Button
                variant="link"
                size="sm"
                className="text-white/90 hover:text-white p-0 h-auto"
                onClick={() => window.open('/advertising-preview', '_blank')}
              >
                Campaign Manager
              </Button>
              <Button
                variant="link"
                size="sm"
                className="text-white/90 hover:text-white p-0 h-auto"
                onClick={() => window.open('/advertising-preview', '_blank')}
              >
                Analytics Dashboard
              </Button>
              <Button
                variant="link"
                size="sm"
                className="text-white/90 hover:text-white p-0 h-auto"
                onClick={() => window.open('/advertising-preview', '_blank')}
              >
                Content Creator
              </Button>
            </div>
            <Badge variant="secondary" className="bg-green-500/20 text-green-100">
              Temporary Access
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}