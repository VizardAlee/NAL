export function AgreementCompanyStamp({ className = '' }: { className?: string }) {
  return (
    <div className={`break-inside-avoid ${className}`}>
      <strong className="block text-[11px]">NAL COMPANY STAMP / SEAL</strong>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/nal-stamp.png"
        alt="NAL General Merchant Ltd. official company stamp"
        className="mt-1 h-auto w-48 max-w-full object-contain"
      />
    </div>
  );
}
