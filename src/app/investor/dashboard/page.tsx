import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/icons";
import Link from "next/link";

export default function InvestorDashboard() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl text-center">
        <Link href="/" className="mb-8 inline-flex items-center space-x-2 text-primary">
          <Logo className="h-8 w-8" />
          <span className="text-2xl font-bold font-headline">
            FinHub Central
          </span>
        </Link>
        <Card>
          <CardContent className="p-8">
            <h1 className="text-2xl font-bold font-headline">Investor Dashboard</h1>
            <p className="mt-2 text-muted-foreground">This page is under construction.</p>
            <p className="mt-4 text-sm">
                <Link href="/login" className="text-primary hover:underline">
                    Return to login
                </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
