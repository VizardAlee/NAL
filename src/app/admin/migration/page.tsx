'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { PageHeader } from '@/components/page-header';
import {
  importUsersAction,
  importDealsAction,
  importInvestmentsAction,
} from './actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Database, Upload, Loader2, Users, FileText, Landmark } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type ActionResponse = {
  success: boolean;
  message: string;
  summary?: { total: number; success: number; failed: number };
};

function SubmitButton({ title }: { title: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Upload className="mr-2 h-4 w-4" />
      )}
      {title}
    </Button>
  );
}

function ImportCard({
  title,
  description,
  action,
  icon: Icon,
  requiredFields,
}: {
  title: string;
  description: string;
  action: (prevState: any, formData: FormData) => Promise<ActionResponse>;
  icon: React.ElementType;
  requiredFields: string[];
}) {
  const [state, formAction] = useActionState(action, { success: false, message: '' });
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? 'Success' : 'Error',
        description: state.message,
        variant: state.success ? 'default' : 'destructive',
      });
      // Clear file input on success
      if (state.success && fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [state, toast]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Icon className="h-6 w-6 text-primary" />
            </div>
            <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
            <h4 className="text-sm font-semibold mb-1">Required CSV Columns:</h4>
            <p className="text-xs text-muted-foreground break-words">
                <code className="bg-muted p-1 rounded-sm">{requiredFields.join(', ')}</code>
            </p>
        </div>
        <form action={formAction} className="space-y-4">
          <Input name="csvFile" type="file" accept=".csv" required ref={fileInputRef} />
          <SubmitButton title={`Import ${title}`} />
        </form>
        {state.summary && (
          <Alert className="mt-4">
            <AlertTitle>Import Summary</AlertTitle>
            <AlertDescription>
              Total Records: {state.summary.total} | Successful: {state.summary.success} | Failed: {state.summary.failed}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}


export default function MigrationPage() {
  return (
    <div>
      <PageHeader
        title="Data Migration"
        description="Import existing business data from CSV files."
        icon={Database}
      />
      <div className="space-y-4">
        <Alert variant="default">
          <AlertTitle>Instructions</AlertTitle>
          <AlertDescription>
            <p>To migrate your data, prepare your CSV files with the required columns listed below. Please import the files in order: <strong>1. Users</strong>, then <strong>2. Deals</strong>, and finally <strong>3. Investments</strong>. This ensures all relationships are correctly linked.</p>
            <p className="mt-2 text-xs text-muted-foreground">Dates should be in <code className="bg-muted p-1 rounded-sm">YYYY-MM-DD</code> format. If an existing user email is found, their record will be updated instead of creating a new one.</p>
          </AlertDescription>
        </Alert>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
            <ImportCard
                title="Users"
                description="Import clients and investors. This step must be completed first."
                action={importUsersAction}
                icon={Users}
                requiredFields={['name', 'email', 'role']}
            />
            <ImportCard
                title="Deals"
                description="Import financing deals. Requires users to be imported first."
                action={importDealsAction}
                icon={FileText}
                requiredFields={['dealName', 'clientEmail', 'principal', 'interestRate', 'durationValue', 'durationUnit', 'repaymentType', 'repaymentFrequency', 'status', 'createdAt']}
            />
            <ImportCard
                title="Investments"
                description="Link investors to deals. Requires users and deals to be imported."
                action={importInvestmentsAction}
                icon={Landmark}
                requiredFields={['investorEmail', 'dealName', 'amount', 'createdAt']}
            />
        </div>
      </div>
    </div>
  );
}
