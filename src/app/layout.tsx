
'use client';

import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { ThemeProvider } from '@/components/theme-provider';
import React, { useEffect } from 'react';
import { CompanyLogoProvider, useCompanyLogo } from '@/components/company-logo-provider';
import { NotificationProvider } from '@/components/notification-provider';


// Metadata cannot be exported from a client component,
// so we define it here statically.
// export const metadata: Metadata = {
//   title: 'NAL General Marchant',
//   description: 'The future of financial management.',
// };

function Favicon() {
  const { logoUrl } = useCompanyLogo();

  useEffect(() => {
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon && logoUrl) {
      favicon.setAttribute('href', logoUrl);
    }
  }, [logoUrl]);
  
  return <link rel="icon" href="/favicon.ico" sizes="any" />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>NAL General Marchant</title>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <FirebaseClientProvider>
            <CompanyLogoProvider>
              <NotificationProvider>
                <Favicon />
                {children}
              </NotificationProvider>
            </CompanyLogoProvider>
          </FirebaseClientProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
