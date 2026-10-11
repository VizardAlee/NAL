import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = { title: string; description?: string; icon: LucideIcon; className?: string; children?: React.ReactNode; };
export function PageHeader({ title, description, icon: Icon, className, children }: PageHeaderProps) {
  return <div className={cn("mb-7 flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-center sm:justify-between", className)}>
    <div className="flex items-start gap-3.5">
      <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></div>
      <div><h1 className="font-headline text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>
    </div>
    {children && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{children}</div>}
  </div>;
}
