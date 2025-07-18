import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Sparkles, Clock, Users, MessageSquare, TrendingUp, Lightbulb, Target, Wand2, Calendar, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SmartCampaignWizardProps {
  onCampaignCreated?: (campaign: any) => void;
}

export function SmartCampaignWizard({ onCampaignCreated }: SmartCampaignWizardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null);
  const [generatedMessage, setGeneratedMessage] = useState<string>("");
  const [step, setStep] = useState<'suggestions' | 'customize' | 'timing'>('suggestions');

  const { toast } = useToast();

  // Get AI campaign suggestions
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['/api/ai/campaign-suggestions'],
    enabled: isOpen
  });

  // Get products and customer groups for context
  const { data: products } = useQuery({
    queryKey: ['/api/products'],
    enabled: isOpen
  });

  const { data: customerGroups } = useQuery({
    queryKey: ['/api/customer-groups'],
    enabled: isOpen
  });

  // Generate personalized message
  const personalizeMutation = useMutation({
    mutationFn: (context: any) => apiRequest('/api/ai/personalized-message', {
      method: 'POST',
      body: JSON.stringify(context)
    }),
    onSuccess: (data) => {
      setGeneratedMessage(data.fullMessage);
      setStep('timing');
    }
  });

  // Optimize timing
  const timingMutation = useMutation({
    mutationFn: (context: any) => apiRequest('/api/ai/optimize-timing', {
      method: 'POST',
      body: JSON.stringify(context)
    }),
    onSuccess: (data) => {
      toast({
        title: "Campaign Optimized!",
        description: `Best time: ${data.recommendedDay} at ${data.recommendedTime}`,
      });
    }
  });

  const handleSuggestionSelect = (suggestion: any) => {
    setSelectedSuggestion(suggestion);
    setStep('customize');
    
    // Generate personalized message based on suggestion
    const context = {
      customerGroup: suggestion.targetAudience,
      productName: products?.[0]?.name || '',
      productCategory: products?.[0]?.category || '',
      timeOfDay: 'morning',
      promotionalOffer: suggestion.title.includes('Promotion') ? '20% off bulk orders' : ''
    };
    
    personalizeMutation.mutate(context);
  };

  const handleCreateCampaign = () => {
    if (selectedSuggestion && generatedMessage) {
      const campaignData = {
        title: selectedSuggestion.title,
        message: generatedMessage,
        customerGroupId: customerGroups?.[0]?.id || 0,
        productId: products?.[0]?.id || 0,
        aiGenerated: true,
        suggestion: selectedSuggestion
      };
      
      if (onCampaignCreated) {
        onCampaignCreated(campaignData);
      }
      
      setIsOpen(false);
      setStep('suggestions');
      setSelectedSuggestion(null);
      setGeneratedMessage("");
      
      toast({
        title: "Smart Campaign Created!",
        description: "Your AI-optimized campaign is ready to send.",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
          <Sparkles className="h-4 w-4" />
          Smart Campaign Wizard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Smart Campaign Wizard
          </DialogTitle>
          <DialogDescription>
            Let AI create optimized campaigns based on your business data and industry best practices
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 ${step === 'suggestions' ? 'text-blue-600' : step === 'customize' || step === 'timing' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'suggestions' ? 'bg-blue-100' : step === 'customize' || step === 'timing' ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Lightbulb className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Choose Suggestion</span>
              </div>
              <div className={`w-8 h-1 ${step === 'customize' || step === 'timing' ? 'bg-green-200' : 'bg-gray-200'}`} />
              <div className={`flex items-center gap-2 ${step === 'customize' ? 'text-blue-600' : step === 'timing' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'customize' ? 'bg-blue-100' : step === 'timing' ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <MessageSquare className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Customize Message</span>
              </div>
              <div className={`w-8 h-1 ${step === 'timing' ? 'bg-green-200' : 'bg-gray-200'}`} />
              <div className={`flex items-center gap-2 ${step === 'timing' ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'timing' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Clock className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Optimize Timing</span>
              </div>
            </div>
          </div>

          {/* Step Content */}
          {step === 'suggestions' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <h3 className="text-lg font-semibold mb-2">AI Campaign Suggestions</h3>
                <p className="text-gray-600">Choose from personalized campaign ideas based on your business</p>
              </div>
              
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  <p className="mt-2 text-gray-600">Generating smart suggestions...</p>
                </div>
              ) : suggestions && suggestions.length > 0 ? (
                <div className="grid gap-4">
                  {suggestions.map((suggestion: any, index: number) => (
                    <Card 
                      key={index} 
                      className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-200"
                      onClick={() => handleSuggestionSelect(suggestion)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Star className="h-5 w-5 text-yellow-500" />
                              {suggestion.title}
                            </CardTitle>
                            <CardDescription className="mt-1">{suggestion.description}</CardDescription>
                          </div>
                          <Badge variant="secondary">AI Recommended</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            <span><strong>Target:</strong> {suggestion.targetAudience}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-green-600" />
                            <span><strong>Timing:</strong> {suggestion.suggestedTiming}</span>
                          </div>
                          <div className="col-span-2 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-purple-600" />
                            <span><strong>Style:</strong> {suggestion.messageStyle}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Lightbulb className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No suggestions available. Set up products and customer groups to get AI recommendations.</p>
                </div>
              )}
            </div>
          )}

          {step === 'customize' && selectedSuggestion && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <h3 className="text-lg font-semibold mb-2">Personalized Message</h3>
                <p className="text-gray-600">AI is generating your campaign message...</p>
              </div>
              
              {personalizeMutation.isPending ? (
                <div className="text-center py-8">
                  <div className="animate-pulse">
                    <Wand2 className="h-12 w-12 mx-auto mb-4 text-purple-600" />
                    <p className="text-gray-600">Crafting your personalized message...</p>
                  </div>
                </div>
              ) : generatedMessage ? (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-green-800">Generated Campaign Message</CardTitle>
                    <CardDescription>Optimized for {selectedSuggestion.targetAudience}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-white rounded border">
                      <p className="whitespace-pre-wrap">{generatedMessage}</p>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <Badge variant="outline">AI Optimized</Badge>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setStep('suggestions')}
                        >
                          Back to Suggestions
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => setStep('timing')}
                        >
                          Continue to Timing
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}

          {step === 'timing' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <h3 className="text-lg font-semibold mb-2">Optimize Send Timing</h3>
                <p className="text-gray-600">Get AI recommendations for the best time to send your campaign</p>
              </div>
              
              <div className="flex justify-center">
                <Button 
                  onClick={() => timingMutation.mutate({
                    customerGroup: selectedSuggestion?.targetAudience || 'General',
                    previousCampaignData: []
                  })}
                  disabled={timingMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {timingMutation.isPending ? "Analyzing..." : "Get Timing Recommendations"}
                  <Clock className="h-4 w-4" />
                </Button>
              </div>

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

              <div className="flex justify-between pt-4">
                <Button 
                  variant="outline"
                  onClick={() => setStep('customize')}
                >
                  Back to Message
                </Button>
                <Button 
                  onClick={handleCreateCampaign}
                  className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                >
                  Create Smart Campaign
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}