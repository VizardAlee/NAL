
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDoc } from '@/firebase/firestore/use-doc';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

type BrandingSettings = {
    logoUrl?: string;
};

export const useCompanyLogo = () => {
    const firestore = useFirestore();
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const brandingRef = useMemo(() => {
        if (!firestore) return null;
        return doc(firestore, 'platformSettings', 'branding');
    }, [firestore]);

    const { data: brandingSettings, loading: brandingLoading } = useDoc<BrandingSettings>(brandingRef);

    // Effect to update favicon and local state when data loads from Firestore
    useEffect(() => {
        if (!brandingLoading) {
            const storedLogo = brandingSettings?.logoUrl;
            if (storedLogo) {
                setLogoUrl(storedLogo);
                updateFavicon(storedLogo);
            } else {
                // If no logo in DB, revert to default
                setLogoUrl(null);
                updateFavicon('/favicon.ico');
            }
            setIsLoaded(true);
        }
    }, [brandingSettings, brandingLoading]);

    const updateFavicon = (url: string) => {
        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = url;
    };

    const setLogoInFirestore = useCallback(async (newLogoUrl: string | null) => {
        if (!firestore || !brandingRef) {
            console.error("Firestore not available to set company logo.");
            return;
        }
        
        try {
            await setDoc(brandingRef, { logoUrl: newLogoUrl }, { merge: true });
            // The real-time listener in useDoc will handle updating the state,
            // so we don't need to call setLogoUrl() here.
        } catch (error) {
            console.error("Failed to set company logo in Firestore:", error);
        }
    }, [firestore, brandingRef]);

    return { logoUrl, setLogo: setLogoInFirestore, isLoaded: isLoaded && !brandingLoading };
};
