import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Sparkles, Clock, Users, MessageSquare, TrendingUp, Lightbulb, Target, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PersonalizedMessage {
  greeting: string;
  mainMessage: string;
  callToAction: string;
  fullMessage: string;
}

interface CampaignSuggestion {
  title: string;
  description: string;
  targetAudience: string;
  suggestedTiming: string;
  messageStyle: string;
}

interface TimingOptimization {
  recommendedTime: string;
  recommendedDay: string;
  reasoning: string;
  confidence: number;
}

interface AICampaignAssistantProps {
  selectedProduct?: any;
  selectedCustomerGroup?: any;
  onMessageGenerated?: (message: string) => void;
}

export function AICampaignAssistant({ 
  selectedProduct, 
  selectedCustomerGroup, 
  onMessageGenerated 
}: AICampaignAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('personalize');
  const [personalizationContext, setPersonalizationContext] = useState({
    customerName: '',
    customerGroup: selectedCustomerGroup?.name || '',
    productName: selectedProduct?.name || '',
    productCategory: selectedProduct?.category || '',
    promotionalOffer: '',
    previousOrders: 0,
    isLoyalCustomer: false,
    timeOfDay: 'morning' as 'morning' | 'afternoon' | 'evening',
    dayOfWeek: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Generate personalized message
  const personalizeMutation = useMutation({
    mutationFn: (context: any) => apiRequest('/api/ai/personalized-message', {
      method: 'POST',
      body: JSON.stringify(context)
    }),
    onSuccess: (data: PersonalizedMessage) => {
      toast({
        title: "Message Generated!",
        description: "AI has created your personalized campaign message.",
      });
      if (onMessageGenerated) {
        onMessageGenerated(data.fullMessage);
      }
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Could not generate personalized message. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Get campaign suggestions
  const { data: campaignSuggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['/api/ai/campaign-suggestions'],
    enabled: isOpen && activeTab === 'suggestions'
  });

  // Optimize timing
  const timingMutation = useMutation({
    mutationFn: (context: any) => apiRequest('/api/ai/optimize-timing', {
      method: 'POST',
      body: JSON.stringify(context)
    }),
    onSuccess: (data: TimingOptimization) => {
      toast({
        title: "Timing Optimized!",
        description: `Best time: ${data.recommendedDay} at ${data.recommendedTime}`,
      });
    }
  });

  const handlePersonalize = () => {
    personalizeMutation.mutate(personalizationContext);
  };

  const handleOptimizeTiming = () => {
    timingMutation.mutate({
      customerGroup: personalizationContext.customerGroup,
      previousCampaignData: []
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          AI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI Campaign Assistant
          </DialogTitle>
          <DialogDescription>
            Use AI to personalize messages, get campaign suggestions, and optimize timing
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="personalize" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Personalize
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </TabsTrigger>
            <TabsTrigger value="timing" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Timing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personalize" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5" />
                  Message Personalization
                </CardTitle>
                <CardDescription>
                  Create personalized WhatsApp messages based on customer and product context
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customerName">Customer Name</Label>
                    <Input
                      id="customerName"
                      value={personalizationContext.customerName}
                      onChange={(e) => setPersonalizationContext(prev => ({
                        ...prev,
                        customerName: e.target.value
                      }))}
                      placeholder="Enter customer name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerGroup">Customer Group</Label>
                    <Input
                      id="customerGroup"
                      value={personalizationContext.customerGroup}
                      onChange={(e) => setPersonalizationContext(prev => ({
                        ...prev,
                        customerGroup: e.target.value
                      }))}
                      placeholder="e.g., VIP Retailers"
                    />
                  </div>
                  <div>
                    <Label htmlFor="productName">Product Name</Label>
                    <Input
                      id="productName"
                      value={personalizationContext.productName}
                      onChange={(e) => setPersonalizationContext(prev => ({
                        ...prev,
                        productName: e.target.value
                      }))}
                      placeholder="Featured product"
                    />
                  </div>
                  <div>
                    <Label htmlFor="timeOfDay">Time of Day</Label>
                    <Select 
                      value={personalizationContext.timeOfDay}
                      onValueChange={(value) => setPersonalizationContext(prev => ({
                        ...prev,
                        timeOfDay: value as 'morning' | 'afternoon' | 'evening'
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="afternoon">Afternoon</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="promotionalOffer">Promotional Offer (Optional)</Label>
                  <Input
                    id="promotionalOffer"
                    value={personalizationContext.promotionalOffer}
                    onChange={(e) => setPersonalizationContext(prev => ({
                      ...prev,
                      promotionalOffer: e.target.value
                    }))}
                    placeholder="e.g., 20% off bulk orders"
                  />
                </div>

                <Button 
                  onClick={handlePersonalize}
                  disabled={personalizeMutation.isPending}
                  className="w-full"
                >
                  {personalizeMutation.isPending ? "Generating..." : "Generate Personalized Message"}
                </Button>

                {personalizeMutation.data && (
                  <Card className="border-green-200 bg-green-50">
                    <CardHeader>
                      <CardTitle className="text-green-800">Generated Message</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div>
                          <strong>Greeting:</strong> {personalizeMutation.data.greeting}
                        </div>
                        <div>
                          <strong>Main Message:</strong> {personalizeMutation.data.mainMessage}
                        </div>
                        <div>
                          <strong>Call to Action:</strong> {personalizeMutation.data.callToAction}
                        </div>
                        <div className="p-3 bg-white rounded border">
                          <strong>Complete Message:</strong><br />
                          {personalizeMutation.data.fullMessage}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(personalizeMutation.data.fullMessage);
                            toast({ title: "Copied to clipboard!" });
                          }}
                        >
                          Copy Message
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Campaign Suggestions
                </CardTitle>
                <CardDescription>
                  AI-generated campaign ideas based on your business data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {suggestionsLoading ? (
                  <div className="text-center py-4">Loading suggestions...</div>
                ) : campaignSuggestions && campaignSuggestions.length > 0 ? (
                  <div className="space-y-4">
                    {campaignSuggestions.map((suggestion: CampaignSuggestion, index: number) => (
                      <Card key={index} className="border-blue-200">
                        <CardHeader>
                          <CardTitle className="text-lg">{suggestion.title}</CardTitle>
                          <CardDescription>{suggestion.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <strong>Target:</strong> {suggestion.targetAudience}
                            </div>
                            <div>
                              <strong>Timing:</strong> {suggestion.suggestedTiming}
                            </div>
                            <div className="col-span-2">
                              <strong>Style:</strong> {suggestion.messageStyle}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    No suggestions available. Make sure you have products and customer groups set up.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Timing Optimization
                </CardTitle>
                <CardDescription>
                  AI-powered timing recommendations for maximum engagement
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={handleOptimizeTiming}
                  disabled={timingMutation.isPending}
                  className="w-full"
                >
                  {timingMutation.isPending ? "Analyzing..." : "Get Timing Recommendations"}
                </Button>

                {timingMutation.data && (
                  <Card className="border-purple-200 bg-purple-50">
                    <CardHeader>
                      <CardTitle className="text-purple-800">Optimal Timing</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <strong>Recommended:</strong> {timingMutation.data.recommendedDay} at {timingMutation.data.recommendedTime}
                        </div>
                        <div>
                          <strong>Confidence:</strong> 
                          <Badge variant="secondary" className="ml-2">
                            {Math.round(timingMutation.data.confidence * 100)}%
                          </Badge>
                        </div>
                        <div>
                          <strong>Reasoning:</strong>
                          <p className="text-sm text-gray-600 mt-1">{timingMutation.data.reasoning}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}