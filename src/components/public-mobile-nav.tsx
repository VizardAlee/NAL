"use client";
import Link from 'next/link';
import { Menu, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
export function PublicMobileNav() {
  return <Sheet><SheetTrigger asChild><Button type="button" variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></Button></SheetTrigger>
    <SheetContent className="w-[min(90vw,360px)]"><SheetHeader className="text-left"><SheetTitle>NAL General Merchant</SheetTitle><SheetDescription>Trade, assets and partnerships.</SheetDescription></SheetHeader>
      <nav aria-label="Mobile navigation" className="mt-8 grid gap-2">{[['#about','About NAL'],['#solutions','What we do'],['#models','Commercial models'],['#contact','Contact'],['/help','User guide']].map(([href,label])=><SheetClose asChild key={href}><Link href={href} className="flex min-h-12 items-center justify-between rounded-lg border-b px-3 text-sm font-medium transition-colors hover:bg-muted">{label}<ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Link></SheetClose>)}</nav>
      <SheetClose asChild><Button className="mt-8 w-full" asChild><Link href="/login">Client login</Link></Button></SheetClose>
    </SheetContent></Sheet>;
}
