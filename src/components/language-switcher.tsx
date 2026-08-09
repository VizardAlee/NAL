'use client';

import { Languages } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { useLanguage } from '@/components/language-provider';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/localization';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect } from 'react';

export function LanguageSwitcher({ compact = true }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const { user } = useUser();
  const firestore = useFirestore();
  useEffect(() => {
    if (user?.preferredLanguage) setLanguage(user.preferredLanguage);
  }, [user?.preferredLanguage, setLanguage]);
  async function change(next: SupportedLanguage) {
    setLanguage(next);
    if (user && firestore) {
      try { await updateDoc(doc(firestore, 'users', user.uid), { preferredLanguage: next }); } catch { /* local choice still works offline */ }
    }
  }
  return (
    <Select value={language} onValueChange={(value) => void change(value as SupportedLanguage)}>
      <SelectTrigger aria-label="Choose language" className={compact ? 'h-9 w-[92px]' : 'w-full'}>
        <Languages className="mr-1 h-4 w-4" /><SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((code) => <SelectItem key={code} value={code}>{LANGUAGE_NAMES[code]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
