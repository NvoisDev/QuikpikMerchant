import { useState } from 'react';
import { useTheme, type DashboardTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Palette, Check } from 'lucide-react';

export default function ThemeSelector() {
  const { currentTheme, changeTheme, availableThemes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleThemeChange = (themeId: DashboardTheme) => {
    changeTheme(themeId);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center space-x-2">
          <Palette className="w-4 h-4" />
          <span>Theme</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose Your Dashboard Theme</DialogTitle>
          <DialogDescription>
            Personalize your dashboard with a theme that matches your style
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {availableThemes.map((theme) => (
            <Card 
              key={theme.id} 
              className={`cursor-pointer transition-all duration-200 hover:scale-105 ${
                currentTheme === theme.id ? 'ring-2 ring-green-500' : ''
              }`}
              onClick={() => handleThemeChange(theme.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{theme.name}</h3>
                  {currentTheme === theme.id && (
                    <Badge variant="default" className="bg-green-600">
                      <Check className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 mb-3">{theme.description}</p>
                
                {/* Theme Preview */}
                <div className="space-y-2">
                  <div 
                    className={`h-16 rounded-lg flex items-center justify-center text-white text-sm font-medium ${
                      theme.gradient || 'bg-gradient-to-r from-gray-400 to-gray-600'
                    }`}
                    style={{
                      background: theme.gradient ? undefined : theme.colors.background
                    }}
                  >
                    Dashboard Preview
                  </div>
                  
                  <div className="flex space-x-2">
                    <div 
                      className="flex-1 h-8 rounded"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                    <div 
                      className="flex-1 h-8 rounded"
                      style={{ backgroundColor: theme.colors.secondary }}
                    />
                    <div 
                      className="flex-1 h-8 rounded"
                      style={{ backgroundColor: theme.colors.accent }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}