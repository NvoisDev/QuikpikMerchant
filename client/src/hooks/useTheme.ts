import { useState, useEffect } from 'react';

export type DashboardTheme = 'gradient' | 'minimal' | 'dark' | 'ocean' | 'sunset';

interface ThemeConfig {
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    card: string;
    accent: string;
  };
  gradient?: string;
}

export const themeConfigs: Record<DashboardTheme, ThemeConfig> = {
  gradient: {
    name: 'Modern Gradient',
    description: 'Colorful gradients with glass effects',
    colors: {
      primary: 'hsl(210, 100%, 50%)',
      secondary: 'hsl(280, 100%, 70%)',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      card: 'rgba(255, 255, 255, 0.1)',
      accent: 'hsl(45, 100%, 60%)'
    },
    gradient: 'bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500'
  },
  minimal: {
    name: 'Clean Minimal',
    description: 'Simple white background with subtle shadows',
    colors: {
      primary: 'hsl(210, 50%, 40%)',
      secondary: 'hsl(210, 20%, 60%)',
      background: '#ffffff',
      card: '#ffffff',
      accent: 'hsl(151, 77%, 36%)'
    }
  },
  dark: {
    name: 'Dark Professional',
    description: 'Dark theme with green accents',
    colors: {
      primary: 'hsl(151, 77%, 36%)',
      secondary: 'hsl(210, 20%, 80%)',
      background: 'hsl(222, 84%, 5%)',
      card: 'hsl(222, 84%, 8%)',
      accent: 'hsl(151, 77%, 45%)'
    }
  },
  ocean: {
    name: 'Ocean Blue',
    description: 'Calming blues and teals',
    colors: {
      primary: 'hsl(195, 100%, 50%)',
      secondary: 'hsl(180, 100%, 40%)',
      background: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
      card: 'rgba(255, 255, 255, 0.15)',
      accent: 'hsl(170, 100%, 50%)'
    },
    gradient: 'bg-gradient-to-br from-blue-400 via-cyan-500 to-teal-500'
  },
  sunset: {
    name: 'Warm Sunset',
    description: 'Orange and pink sunset colors',
    colors: {
      primary: 'hsl(25, 100%, 55%)',
      secondary: 'hsl(340, 100%, 70%)',
      background: 'linear-gradient(135deg, #ff7b7b 0%, #ff8e53 100%)',
      card: 'rgba(255, 255, 255, 0.2)',
      accent: 'hsl(50, 100%, 60%)'
    },
    gradient: 'bg-gradient-to-br from-orange-400 via-red-400 to-pink-500'
  }
};

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<DashboardTheme>('minimal');

  // Load theme from localStorage on mount, default to minimal
  useEffect(() => {
    const savedTheme = localStorage.getItem('dashboard-theme') as DashboardTheme;
    if (savedTheme && themeConfigs[savedTheme]) {
      setCurrentTheme(savedTheme);
    } else {
      // Set minimal as default if no saved theme
      setCurrentTheme('minimal');
      localStorage.setItem('dashboard-theme', 'minimal');
    }
  }, []);

  // Save theme to localStorage when changed
  const changeTheme = (theme: DashboardTheme) => {
    setCurrentTheme(theme);
    localStorage.setItem('dashboard-theme', theme);
    
    // Apply theme to document root for CSS variables
    const config = themeConfigs[theme];
    const root = document.documentElement;
    
    Object.entries(config.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value);
    });
  };

  // Apply current theme on mount and when theme changes
  useEffect(() => {
    const config = themeConfigs[currentTheme];
    const root = document.documentElement;
    
    Object.entries(config.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value);
    });
  }, [currentTheme]);

  return {
    currentTheme,
    changeTheme,
    themeConfig: themeConfigs[currentTheme],
    availableThemes: Object.entries(themeConfigs).map(([key, config]) => ({
      id: key as DashboardTheme,
      ...config
    }))
  };
}