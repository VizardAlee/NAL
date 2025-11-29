
import Image from 'next/image';
import type { SVGProps } from "react";
import { cn } from '@/lib/utils';

type LogoProps = SVGProps<SVGSVGElement> & {
  imageUrl?: string | null;
};


export function Logo({ imageUrl, className, ...props }: LogoProps) {
  if (imageUrl) {
    return (
      <div className={cn("relative", className)}>
        <Image
          src={imageUrl}
          alt="Company Logo"
          layout="fill"
          objectFit="contain"
        />
      </div>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}


export function Naira(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 18V6" />
      <path d="M17 6v12" />
      <path d="M7 12h10" />
      <path d="M17 12h-10" />
      <path d="m16 8-8 8" />
      <path d="m8 8 8 8" />
    </svg>
  );
}
