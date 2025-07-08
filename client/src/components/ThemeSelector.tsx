import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useTheme } from '@/contexts/ThemeContext';
import { Palette, Check, Sparkles, Settings, Eye } from 'lucide-react';

export const ThemeSelector: React.FC = () => {
  const { currentTheme, setTheme, availableThemes, isCustomTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleThemeSelect = (themeId: string) => {
    setTheme(themeId);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Theme
          <Badge variant="secondary" className="ml-1">
            {isCustomTheme ? 'Custom' : currentTheme.name}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Dashboard Theme Selector
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Current Theme Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Current Theme Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-lg bg-gradient-to-br ${currentTheme.gradients.background} border`}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {currentTheme.gradients.cards.map((gradient, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg bg-gradient-to-br ${gradient} text-white text-center`}
                    >
                      <div className="text-sm font-medium">Sample Card</div>
                      <div className="text-xs opacity-80">£{(index + 1) * 1000}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: currentTheme.colors.text }}>
                      {currentTheme.name}
                    </h3>
                    <p className="text-sm" style={{ color: currentTheme.colors.muted }}>
                      {currentTheme.description}
                    </p>
                  </div>
                  {isCustomTheme && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Custom
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Theme Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableThemes.map((theme) => (
              <Card 
                key={theme.id}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  currentTheme.id === theme.id && !isCustomTheme ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleThemeSelect(theme.id)}
              >
                <CardContent className="p-4">
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${theme.gradients.background} mb-3`}>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {theme.gradients.cards.slice(0, 4).map((gradient, index) => (
                        <div
                          key={index}
                          className={`h-8 rounded bg-gradient-to-br ${gradient}`}
                        />
                      ))}
                    </div>
                    <div className="h-4 rounded" style={{ backgroundColor: theme.colors.surface }} />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{theme.name}</h3>
                      <p className="text-xs text-gray-600">{theme.description}</p>
                    </div>
                    {currentTheme.id === theme.id && !isCustomTheme && (
                      <div className="flex items-center justify-center w-6 h-6 bg-blue-500 rounded-full">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Custom Theme Builder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Custom Theme Builder
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600 mb-4">
                Create your own personalized theme by selecting colors and gradients.
              </div>
              <Button variant="outline" className="w-full" disabled>
                <Sparkles className="h-4 w-4 mr-2" />
                Custom Theme Builder (Coming Soon)
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ThemeSelector;