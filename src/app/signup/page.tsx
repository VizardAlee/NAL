
import { Logo } from "@/components/icons";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="flex items-center space-x-2 text-primary">
            <Logo className="h-8 w-8" />
            <span className="text-2xl font-bold font-headline">
              FinHub Central
            </span>
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Sign Up</CardTitle>
            <CardDescription>
              Sign-up is currently managed by administrators. Please contact support to create an account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className="text-sm text-primary hover:underline">
              &larr; Back to Login
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
