import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  icon: LucideIcon;
  className?: string;
  children?: React.ReactNode;
};

export function PageHeader({ title, description, icon: Icon, className, children }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 rounded-lg border bg-card/70 p-4 shadow-sm shadow-primary/5 backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-5", className)}>
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-primary/20 bg-primary/10 shadow-sm">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight font-headline sm:text-3xl">{title}</h1>
        </div>
        {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="mt-4 flex-shrink-0 sm:mt-0">{children}</div>}
    </div>
  );
}
