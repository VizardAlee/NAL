
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
      viewBox="0 0 256 256"
      className={cn("text-accent", className)}
      {...props}
    >
        <path fill="currentColor" d="M104 152H56a8 8 0 0 1 0-16h40v-40H72a8 8 0 0 1 0-16h24V56a8 8 0 0 1 16 0v24h40a8 8 0 0 1 0 16h-40v40h64a8 8 0 0 1 0 16h-64v24a8 8 0 0 1-16 0v-24Zm96-16h-32a8 8 0 0 0 0 16h32a8 8 0 0 0 0-16Z"/>
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
