import Image from 'next/image';
import { cn } from '@/lib/utils';

export function NonInterestInstitutionMark({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn('relative h-9 w-16 shrink-0', className)}
      title="Non-Interest Institution"
    >
      <Image
        src="/non-interest-institution.png"
        alt="NII — Non-Interest Institution"
        fill
        priority={priority}
        sizes="(max-width: 768px) 64px, 96px"
        className="object-contain"
      />
    </div>
  );
}
