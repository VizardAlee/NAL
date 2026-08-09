export const SUPPORTED_LANGUAGES = ['en', 'ha', 'ig', 'yo'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English', ha: 'Hausa', ig: 'Igbo', yo: 'Yorùbá',
};

export function normalizeLanguage(value: unknown): SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage) ? value as SupportedLanguage : 'en';
}

const translations = {
  en: {
    home: 'Home', deals: 'Deals', agreements: 'Agreements', request: 'Request', modes: 'Modes', settings: 'Settings',
    dashboard: 'Dashboard', transactions: 'Transactions', activity: 'Activity', allDeals: 'All Deals', financingModes: 'Financing Modes',
    language: 'Language', saveChanges: 'Save Changes', personalInformation: 'Personal Information',
    repaymentReminder: 'Repayment reminder', agreementLanguage: 'Agreement language',
  },
  ha: {
    home: 'Gida', deals: 'Yarjejeniyoyi', agreements: 'Takardun Yarjejeniya', request: 'Buƙata', modes: 'Hanyoyi', settings: 'Saituna',
    dashboard: 'Babban Shafi', transactions: 'Mu’amaloli', activity: 'Ayyuka', allDeals: 'Duk Yarjejeniyoyi', financingModes: 'Hanyoyin Kuɗi',
    language: 'Harshe', saveChanges: 'Ajiye Canje-canje', personalInformation: 'Bayanan Kai',
    repaymentReminder: 'Tunatarwar biya', agreementLanguage: 'Harshen yarjejeniya',
  },
  ig: {
    home: 'Ụlọ', deals: 'Nkwekọrịta', agreements: 'Akwụkwọ Nkwekọrịta', request: 'Arịrịọ', modes: 'Ụzọ', settings: 'Ntọala',
    dashboard: 'Ogwe Nchịkwa', transactions: 'Azụmahịa', activity: 'Ihe Omume', allDeals: 'Nkwekọrịta Niile', financingModes: 'Ụzọ Ego',
    language: 'Asụsụ', saveChanges: 'Chekwaa Mgbanwe', personalInformation: 'Ozi Nkeonwe',
    repaymentReminder: 'Nchetara ịkwụ ụgwọ', agreementLanguage: 'Asụsụ nkwekọrịta',
  },
  yo: {
    home: 'Ilé', deals: 'Àwọn Àdéhùn', agreements: 'Àwọn Ìwé Àdéhùn', request: 'Ìbéèrè', modes: 'Àwọn Ọ̀nà', settings: 'Ètò',
    dashboard: 'Pátákó Ìṣàkóso', transactions: 'Àwọn Ìṣòwò', activity: 'Ìgbòkègbodò', allDeals: 'Gbogbo Àdéhùn', financingModes: 'Àwọn Ọ̀nà Ìnáwó',
    language: 'Èdè', saveChanges: 'Fi Àyípadà Pamọ́', personalInformation: 'Àlàyé Ara Ẹni',
    repaymentReminder: 'Ìránnilétí ìsanwó', agreementLanguage: 'Èdè àdéhùn',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
export function translate(language: SupportedLanguage, key: TranslationKey): string {
  return translations[language]?.[key] || translations.en[key];
}
