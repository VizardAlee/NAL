
'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useDoc, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';

type CompanyLogoContextType = {
  logoUrl: string | null;
  loading: boolean;
};

const CompanyLogoContext = createContext<CompanyLogoContextType>({
  logoUrl: null,
  loading: true,
});

export function CompanyLogoProvider({ children }: { children: React.ReactNode }) {
  const firestore = useFirestore();

  const brandingRef = useMemo(() => {
    if (!firestore) return null;
    return doc(firestore, 'platformSettings', 'branding');
  }, [firestore]);

  const { data: brandingSettings, loading } = useDoc<{ logoUrl: string }>(brandingRef);

  const value = useMemo(() => ({
    logoUrl: brandingSettings?.logoUrl || null,
    loading,
  }), [brandingSettings, loading]);

  return (
    <CompanyLogoContext.Provider value={value}>
      {children}
    </CompanyLogoContext.Provider>
  );
}

export const useCompanyLogo = () => {
  const context = useContext(CompanyLogoContext);
  if (context === undefined) {
    throw new Error('useCompanyLogo must be used within a CompanyLogoProvider');
  }
  return context;
};
