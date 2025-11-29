
'use client';

import { useState, useEffect, useCallback } from 'react';

const LOGO_STORAGE_KEY = 'company-logo';

export const useCompanyLogo = () => {
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        try {
            const storedLogo = localStorage.getItem(LOGO_STORAGE_KEY);
            if (storedLogo) {
                setLogoUrl(storedLogo);
                updateFavicon(storedLogo);
            }
        } catch (error) {
            console.warn('Could not access localStorage for company logo.');
        } finally {
            setIsLoaded(true);
        }
    }, []);

    const updateFavicon = (url: string) => {
        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = url;
    };

    const setLogo = useCallback((newLogoUrl: string | null) => {
        try {
            if (newLogoUrl) {
                localStorage.setItem(LOGO_STORAGE_KEY, newLogoUrl);
                setLogoUrl(newLogoUrl);
                updateFavicon(newLogoUrl);
            } else {
                localStorage.removeItem(LOGO_STORAGE_KEY);
                setLogoUrl(null);
                updateFavicon('/favicon.ico'); // Revert to default
            }
        } catch (error) {
            console.warn('Could not access localStorage to set company logo.');
        }
    }, []);

    return { logoUrl, setLogo, isLoaded };
};
