import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Palette, Check } from "lucide-react";

export type CustomerTheme = 'emerald' | 'ocean' | 'grape' | 'sunset' | 'rose' | 'midnight';

interface ThemeOption {
  id: CustomerTheme;
  name: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  preview: {
    background: string;
    card: string;
    text: string;
  };
}

const themeOptions: ThemeOption[] = [
  {
    id: 'emerald',
    name: 'Fresh Emerald',
    description: 'Classic green theme with natural vibes',
    primaryColor: 'hsl(151, 77%, 36%)',
    accentColor: 'hsl(151, 77%, 36%)',
    preview: { background: '#ffffff', card: '#ffffff', text: '#1f2937' }
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    description: 'Calming blue inspired by deep waters',
    primaryColor: 'hsl(212, 100%, 50%)',
    accentColor: 'hsl(212, 100%, 50%)',
    preview: { background: '#ffffff', card: '#ffffff', text: '#1f2937' }
  },
  {
    id: 'grape',
    name: 'Royal Grape',
    description: 'Rich purple with luxury feel',
    primaryColor: 'hsl(262, 83%, 58%)',
    accentColor: 'hsl(262, 83%, 58%)',
    preview: { background: '#ffffff', card: '#ffffff', text: '#1f2937' }
  },
  {
    id: 'sunset',
    name: 'Warm Sunset',
    description: 'Energetic orange like golden hour',
    primaryColor: 'hsl(24, 95%, 53%)',
    accentColor: 'hsl(24, 95%, 53%)',
    preview: { background: '#ffffff', card: '#ffffff', text: '#1f2937' }
  },
  {
    id: 'rose',
    name: 'Elegant Rose',
    description: 'Sophisticated pink with modern touch',
    primaryColor: 'hsl(330, 81%, 60%)',
    accentColor: 'hsl(330, 81%, 60%)',
    preview: { background: '#ffffff', card: '#ffffff', text: '#1f2937' }
  },
  {
    id: 'midnight',
    name: 'Midnight Dark',
    description: 'Dark theme for night owls',
    primaryColor: 'hsl(200, 98%, 39%)',
    accentColor: 'hsl(200, 98%, 39%)',
    preview: { background: 'hsl(200, 15%, 8%)', card: 'hsl(200, 15%, 12%)', text: 'hsl(0, 0%, 95%)' }
  }
];

interface ThemeSwitcherProps {
  currentTheme?: CustomerTheme;
  onThemeChange?: (theme: CustomerTheme) => void;
}

export function ThemeSwitcher({ currentTheme = 'emerald', onThemeChange }: ThemeSwitcherProps) {
  const [selectedTheme, setSelectedTheme] = useState<CustomerTheme>(currentTheme);
  const [isOpen, setIsOpen] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('customer-theme') as CustomerTheme;
    if (savedTheme && themeOptions.find(t => t.id === savedTheme)) {
      setSelectedTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  const applyTheme = (theme: CustomerTheme) => {
    document.documentElement.setAttribute('data-customer-theme', theme);
    localStorage.setItem('customer-theme', theme);
    setSelectedTheme(theme);
    onThemeChange?.(theme);
  };

  const handleThemeSelect = (theme: CustomerTheme) => {
    applyTheme(theme);
    setIsOpen(false);
  };

  const currentThemeData = themeOptions.find(t => t.id === selectedTheme) || themeOptions[0];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 theme-transition"
          title="Change theme"
        >
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">{currentThemeData.name}</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md theme-transition">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Choose Your Style
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3 mt-4">
          {themeOptions.map((theme) => (
            <Card 
              key={theme.id}
              className={`cursor-pointer transition-all duration-200 hover:scale-105 ${
                selectedTheme === theme.id 
                  ? 'ring-2 ring-offset-2' 
                  : 'hover:shadow-md'
              }`}
              style={{
                '--ring-color': selectedTheme === theme.id ? theme.primaryColor : 'transparent'
              } as React.CSSProperties}
              onClick={() => handleThemeSelect(theme.id)}
            >
              <CardContent className="p-3">
                <div className="space-y-2">
                  {/* Theme Preview */}
                  <div 
                    className="h-16 rounded-md border-2 relative overflow-hidden"
                    style={{ 
                      backgroundColor: theme.preview.background,
                      borderColor: theme.primaryColor 
                    }}
                  >
                    {/* Mini header */}
                    <div 
                      className="h-3 w-full"
                      style={{ backgroundColor: theme.primaryColor }}
                    />
                    
                    {/* Mini card */}
                    <div className="p-2 h-full flex items-center justify-center">
                      <div 
                        className="w-8 h-6 rounded border"
                        style={{ 
                          backgroundColor: theme.preview.card,
                          borderColor: theme.primaryColor + '40'
                        }}
                      />
                    </div>
                    
                    {/* Selection indicator */}
                    {selectedTheme === theme.id && (
                      <div 
                        className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                  
                  {/* Theme Info */}
                  <div>
                    <h3 className="font-medium text-sm leading-tight">
                      {theme.name}
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      {theme.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="mt-4 text-xs text-gray-500 text-center">
          Your theme choice is saved across all visits
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook for using theme context
export function useCustomerTheme() {
  const [theme, setTheme] = useState<CustomerTheme>('emerald');

  useEffect(() => {
    const savedTheme = localStorage.getItem('customer-theme') as CustomerTheme;
    if (savedTheme && themeOptions.find(t => t.id === savedTheme)) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-customer-theme', savedTheme);
    }
  }, []);

  const changeTheme = (newTheme: CustomerTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-customer-theme', newTheme);
    localStorage.setItem('customer-theme', newTheme);
  };

  return { theme, changeTheme, themeOptions };
}