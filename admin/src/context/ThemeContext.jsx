import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const storageKey = 'dv_theme';
const defaultTheme = 'linen';

export const themes = [
  { id: 'linen', label: 'Linen', description: 'Warm paper, ink accents' },
  { id: 'dark', label: 'Dark', description: 'Graphite vault, low glare' }
];

function systemPreference() {
  if (typeof window === 'undefined' || !window.matchMedia) return defaultTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'linen';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return localStorage.getItem(storageKey) || defaultTheme;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(storageKey, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themes,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'linen' : 'dark'))
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
