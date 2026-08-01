import { agreementSignerRoleLabel, type AgreementSignature } from '@/lib/agreements/signing';

export function AgreementElectronicSignature({ signature }: { signature?: AgreementSignature }) {
  if (!signature) {
    return <p className="mt-3">Signature: ________________________<br />Date: ____________________________</p>;
  }

  return (
    <div className="mt-3 rounded border border-emerald-200 bg-emerald-50/50 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={signature.signatureDataUrl} alt={`${signature.signerName} signature`} className="h-14 max-w-[13rem] object-contain object-left" />
      <p className="mt-1 text-[10px] leading-4 text-slate-600">
        Electronically signed by {signature.signerName}<br />
        As {agreementSignerRoleLabel(signature.role)} · {new Date(signature.signedAt).toLocaleString('en-NG')}<br />
        Verification: {signature.signatureHash.slice(0, 16)}…
      </p>
    </div>
  );
}
