'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeLanguage, translate, type SupportedLanguage, type TranslationKey } from '@/lib/localization';
import { translateUiText } from '@/lib/ui-translations';
import { UiLanguageBridge } from '@/components/ui-language-bridge';
import { useUser } from '@/firebase';

const STORAGE_KEY = 'nal-preferred-language';
type LanguageContextValue = {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: TranslationKey) => string;
  tx: (text: string) => string;
  locale: string;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const { user } = useUser();
  useEffect(() => {
    setLanguageState(normalizeLanguage(window.localStorage.getItem(STORAGE_KEY)));
  }, []);
  const setLanguage = useCallback((next: SupportedLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);
  useEffect(() => {
    if (!user?.preferredLanguage) return;
    const savedLanguage = normalizeLanguage(user.preferredLanguage);
    setLanguageState(savedLanguage);
    window.localStorage.setItem(STORAGE_KEY, savedLanguage);
    document.documentElement.lang = savedLanguage;
  }, [user?.preferredLanguage]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const locale = language === 'en' ? 'en-NG' : `${language}-NG`;
  const value = useMemo(() => ({
    language,
    setLanguage,
    locale,
    t: (key: TranslationKey) => translate(language, key),
    tx: (text: string) => translateUiText(language, text),
  }), [language, locale, setLanguage]);
  return (
    <LanguageContext.Provider value={value}>
      <UiLanguageBridge language={language} />
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider.');
  return value;
}
