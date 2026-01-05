
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from './dbService';

interface SettingsContextType {
  logoUrl: string | null;
  updateLogo: (url: string | null) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  refreshSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Initial load
  useEffect(() => {
    const saved = db.getSettings();
    setLogoUrl(saved.logoUrl);
    setIsDarkMode(saved.isDarkMode);
  }, []);

  useEffect(() => {
    // Apply dark mode class to html element
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const updateLogo = (url: string | null) => {
    db.updateSettings({ logoUrl: url });
    setLogoUrl(url);
  };

  const toggleDarkMode = () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    db.updateSettings({ isDarkMode: newValue });
  };

  // Called after Supabase sync to update UI state
  const refreshSettings = useCallback(() => {
    const saved = db.getSettings();
    setLogoUrl(saved.logoUrl);
    setIsDarkMode(saved.isDarkMode);
  }, []);

  return (
    <SettingsContext.Provider value={{ logoUrl, updateLogo, isDarkMode, toggleDarkMode, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
