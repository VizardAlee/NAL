import { normalizeLanguage, type SupportedLanguage } from '@/lib/localization';

export type RepaymentFrequency = 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly' | string;

function lagosParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

function calendarDay(parts: ReturnType<typeof lagosParts>) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

export function repaymentReminderLeadDays(frequency: RepaymentFrequency) {
  if (frequency === 'Monthly') return 3;
  if (frequency === 'Daily') return 0;
  return 1;
}

export function isRepaymentReminderDue(input: {
  frequency: RepaymentFrequency;
  dueDate: Date;
  now?: Date;
}) {
  const now = lagosParts(input.now || new Date());
  const due = lagosParts(input.dueDate);
  const daysUntilDue = calendarDay(due) - calendarDay(now);
  if (daysUntilDue !== repaymentReminderLeadDays(input.frequency)) return false;
  return input.frequency !== 'Daily' || now.hour >= 16;
}

export function repaymentReminderText(frequency: RepaymentFrequency, language?: SupportedLanguage) {
  const key = frequency === 'Monthly' ? 'monthly' : frequency === 'Daily' ? 'daily' : frequency === 'Weekly' ? 'weekly' : 'other';
  const messages = {
    en: { monthly: 'Your monthly repayment is due in 3 days.', daily: 'Your daily repayment is due today. Please pay by 4:00 PM.', weekly: 'Your weekly repayment is due tomorrow.', other: 'Your repayment is due tomorrow.' },
    ha: { monthly: 'Biyan ku na wata zai cika nan da kwanaki 3.', daily: 'Biyan ku na yau ya cika yau. Ku biya zuwa karfe 4:00 na yamma.', weekly: 'Biyan ku na mako zai cika gobe.', other: 'Biyan ku zai cika gobe.' },
    ig: { monthly: 'Ụgwọ ọnwa gị ga-eru n’ime ụbọchị atọ.', daily: 'Ụgwọ ụbọchị gị ruru taa. Biko kwụọ tupu elekere anọ nke mgbede.', weekly: 'Ụgwọ izu gị ga-eru echi.', other: 'Ụgwọ gị ga-eru echi.' },
    yo: { monthly: 'Ìsanwó oṣooṣù rẹ yóò tó àkókò ní ọjọ́ mẹ́ta.', daily: 'Ìsanwó ojoojúmọ́ rẹ tó àkókò lónìí. Jọ̀wọ́ san kí ó tó aago mẹ́rin ìrọ̀lẹ́.', weekly: 'Ìsanwó ọ̀sẹ̀ rẹ yóò tó àkókò lọ́la.', other: 'Ìsanwó rẹ yóò tó àkókò lọ́la.' },
  } as const;
  return messages[normalizeLanguage(language)][key];
}
