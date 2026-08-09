import { LANGUAGE_NAMES, normalizeLanguage, type SupportedLanguage } from '@/lib/localization';

const notices: Record<SupportedLanguage, string> = {
  en: 'This agreement was generated in English. Names, dates, amounts, account details and references are populated from the verified transaction record.',
  ha: 'An shirya wannan yarjejeniya bisa zabin harshen Hausa. Sunaye, ranaku, kudade, bayanan asusu da lambobin shaida an cika su daga sahihin bayanin mu’amala.',
  ig: 'A kwadebere nkwekọrịta a dịka nhọrọ asụsụ Igbo. E sitere na ndekọ azụmahịa a kwadoro tinye aha, ụbọchị, ego, nkọwa akaụntụ na nọmba ntụaka.',
  yo: 'A pèsè àdéhùn yìí ní ìbámu pẹ̀lú yíyan èdè Yorùbá. Orúkọ, ọjọ́, iye owó, àlàyé àkọọ́lẹ̀ àti nọ́mbà ìtọ́kasí wá láti inú àkọsílẹ̀ ìṣòwò tí a fìdí rẹ̀ múlẹ̀.',
};

export function AgreementLanguageNotice({ language }: { language?: SupportedLanguage }) {
  const selected = normalizeLanguage(language);
  return (
    <aside className="mb-5 rounded border border-[#075a3c]/30 bg-[#f3f8f5] px-4 py-3 text-xs text-slate-700">
      <strong className="text-[#075a3c]">Agreement language: {LANGUAGE_NAMES[selected]}</strong>
      <p className="mt-1">{notices[selected]}</p>
      {selected !== 'en' && <p className="mt-1 italic">The English legal clauses remain alongside the selected-language notice to avoid ambiguity during legal and Sharia review.</p>}
    </aside>
  );
}
