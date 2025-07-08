import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ThemeConfig {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
  };
  gradients: {
    header: string;
    cards: string[];
    background: string;
  };
}

export const predefinedThemes: ThemeConfig[] = [
  {
    id: 'default',
    name: 'Professional Blue',
    description: 'Clean and professional with blue accents',
    colors: {
      primary: '#3b82f6',
      secondary: '#1e40af',
      accent: '#60a5fa',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280'
    },
    gradients: {
      header: 'from-slate-50 to-blue-50',
      cards: [
        'from-emerald-500 to-emerald-600',
        'from-blue-500 to-blue-600',
        'from-purple-500 to-purple-600',
        'from-orange-500 to-orange-600'
      ],
      background: 'from-slate-50 to-blue-50'
    }
  },
  {
    id: 'emerald',
    name: 'Nature Green',
    description: 'Fresh and vibrant with green tones',
    colors: {
      primary: '#10b981',
      secondary: '#059669',
      accent: '#34d399',
      background: '#f0fdf4',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280'
    },
    gradients: {
      header: 'from-emerald-50 to-green-50',
      cards: [
        'from-emerald-500 to-emerald-600',
        'from-green-500 to-green-600',
        'from-teal-500 to-teal-600',
        'from-cyan-500 to-cyan-600'
      ],
      background: 'from-emerald-50 to-green-50'
    }
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    description: 'Elegant and sophisticated purple theme',
    colors: {
      primary: '#8b5cf6',
      secondary: '#7c3aed',
      accent: '#a78bfa',
      background: '#faf5ff',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280'
    },
    gradients: {
      header: 'from-purple-50 to-violet-50',
      cards: [
        'from-purple-500 to-purple-600',
        'from-violet-500 to-violet-600',
        'from-indigo-500 to-indigo-600',
        'from-pink-500 to-pink-600'
      ],
      background: 'from-purple-50 to-violet-50'
    }
  },
  {
    id: 'rose',
    name: 'Warm Rose',
    description: 'Warm and inviting with rose accents',
    colors: {
      primary: '#f43f5e',
      secondary: '#e11d48',
      accent: '#fb7185',
      background: '#fff1f2',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280'
    },
    gradients: {
      header: 'from-rose-50 to-pink-50',
      cards: [
        'from-rose-500 to-rose-600',
        'from-pink-500 to-pink-600',
        'from-red-500 to-red-600',
        'from-orange-500 to-orange-600'
      ],
      background: 'from-rose-50 to-pink-50'
    }
  },
  {
    id: 'dark',
    name: 'Dark Mode',
    description: 'Sleek dark theme for night usage',
    colors: {
      primary: '#60a5fa',
      secondary: '#3b82f6',
      accent: '#93c5fd',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f8fafc',
      muted: '#64748b'
    },
    gradients: {
      header: 'from-slate-900 to-slate-800',
      cards: [
        'from-blue-600 to-blue-700',
        'from-emerald-600 to-emerald-700',
        'from-purple-600 to-purple-700',
        'from-orange-600 to-orange-700'
      ],
      background: 'from-slate-900 to-slate-800'
    }
  },
  {
    id: 'sunset',
    name: 'Sunset Orange',
    description: 'Warm sunset colors with orange gradients',
    colors: {
      primary: '#f97316',
      secondary: '#ea580c',
      accent: '#fb923c',
      background: '#fff7ed',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280'
    },
    gradients: {
      header: 'from-orange-50 to-amber-50',
      cards: [
        'from-orange-500 to-orange-600',
        'from-amber-500 to-amber-600',
        'from-yellow-500 to-yellow-600',
        'from-red-500 to-red-600'
      ],
      background: 'from-orange-50 to-amber-50'
    }
  }
];

interface ThemeContextType {
  currentTheme: ThemeConfig;
  setTheme: (themeId: string) => void;
  availableThemes: ThemeConfig[];
  isCustomTheme: boolean;
  createCustomTheme: (config: Partial<ThemeConfig>) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(predefinedThemes[0]);
  const [isCustomTheme, setIsCustomTheme] = useState(false);

  useEffect(() => {
    // Load saved theme from localStorage
    const savedThemeId = localStorage.getItem('dashboard-theme');
    const savedCustomTheme = localStorage.getItem('dashboard-custom-theme');
    
    if (savedCustomTheme) {
      try {
        const customTheme = JSON.parse(savedCustomTheme);
        setCurrentTheme(customTheme);
        setIsCustomTheme(true);
      } catch (error) {
        console.error('Error loading custom theme:', error);
      }
    } else if (savedThemeId) {
      const theme = predefinedThemes.find(t => t.id === savedThemeId);
      if (theme) {
        setCurrentTheme(theme);
        setIsCustomTheme(false);
      }
    }
  }, []);

  const setTheme = (themeId: string) => {
    const theme = predefinedThemes.find(t => t.id === themeId);
    if (theme) {
      setCurrentTheme(theme);
      setIsCustomTheme(false);
      localStorage.setItem('dashboard-theme', themeId);
      localStorage.removeItem('dashboard-custom-theme');
      
      // Apply theme to document root
      applyThemeToRoot(theme);
    }
  };

  const createCustomTheme = (config: Partial<ThemeConfig>) => {
    const customTheme: ThemeConfig = {
      id: 'custom',
      name: 'Custom Theme',
      description: 'Your personalized theme',
      ...config,
      colors: {
        ...predefinedThemes[0].colors,
        ...config.colors
      },
      gradients: {
        ...predefinedThemes[0].gradients,
        ...config.gradients
      }
    };
    
    setCurrentTheme(customTheme);
    setIsCustomTheme(true);
    localStorage.setItem('dashboard-custom-theme', JSON.stringify(customTheme));
    localStorage.removeItem('dashboard-theme');
    
    // Apply theme to document root
    applyThemeToRoot(customTheme);
  };

  const applyThemeToRoot = (theme: ThemeConfig) => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', theme.colors.primary);
    root.style.setProperty('--theme-secondary', theme.colors.secondary);
    root.style.setProperty('--theme-accent', theme.colors.accent);
    root.style.setProperty('--theme-background', theme.colors.background);
    root.style.setProperty('--theme-surface', theme.colors.surface);
    root.style.setProperty('--theme-text', theme.colors.text);
    root.style.setProperty('--theme-muted', theme.colors.muted);
  };

  // Apply current theme on mount
  useEffect(() => {
    applyThemeToRoot(currentTheme);
  }, [currentTheme]);

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        setTheme,
        availableThemes: predefinedThemes,
        isCustomTheme,
        createCustomTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};