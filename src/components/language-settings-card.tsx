'use client';

import { Languages } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LanguageSettingsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          App Language
        </CardTitle>
        <CardDescription>
          Choose the language used throughout your dashboard and personalised documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-md">
        <LanguageSwitcher compact={false} />
      </CardContent>
    </Card>
  );
}
