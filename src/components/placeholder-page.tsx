import { PageHeader } from "@/components/page-header";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

type PlaceholderPageProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} description={description} icon={icon} />
      <Card className="mt-6 border-dashed">
        <CardContent className="p-12 text-center">
          <Construction className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Under Construction</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This page is currently being developed. Check back soon!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
