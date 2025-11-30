
'use client';

import { useActionState, useEffect, useRef } from 'react';
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
import { Database, Upload, Loader2, Users, FileText, Landmark, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
                <code className="bg-muted p-1 rounded-sm break-words">{requiredFields.join(', ')}</code>
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

function InstructionContent() {
    return (
        <div className="prose prose-sm prose-invert max-w-none text-muted-foreground">
            <p>To migrate your data, prepare your CSV files with the required columns listed below. Please import the files in order: <strong>1. Users</strong>, then <strong>2. Deals</strong>, and finally <strong>3. Investments</strong>. This ensures all relationships are correctly linked.</p>
            <Alert variant="default" className="mt-4">
                <AlertDescription>
                    <p>Dates should be in <code className="bg-muted p-1 rounded-sm">YYYY-MM-DD</code> format. If an existing user email is found, their record will be updated instead of creating a new one.</p>
                </AlertDescription>
            </Alert>
            
            <div className="mt-6">
                <h4 className="font-semibold text-foreground">1. Users File (<code>users.csv</code>)</h4>
                <p>Contains all your clients and investors.</p>
                <ul className="list-disc pl-5">
                    <li><strong>Required Columns:</strong> <code className="bg-muted p-1 rounded-sm break-words">name, email, role</code></li>
                    <li>The <code>role</code> must be either <code>Client</code> or <code>Investor</code>.</li>
                </ul>
                <pre className="bg-muted p-2 rounded-md mt-2 text-xs overflow-x-auto"><code>{`name,email,role
John Doe,john.doe@example.com,Client
Jane Smith,jane.smith@example.com,Investor`}</code></pre>
            </div>

             <div className="mt-6">
                <h4 className="font-semibold text-foreground">2. Deals File (<code>deals.csv</code>)</h4>
                <p>Contains all financing deals.</p>
                <ul className="list-disc pl-5">
                    <li><strong>Required Columns:</strong> <code className="bg-muted p-1 rounded-sm break-words">dealName, clientEmail, principal, profitRate, durationValue, durationUnit, repaymentType, repaymentFrequency, status, createdAt</code></li>
                    <li><code>clientEmail</code> must match an email from your <code>users.csv</code> file.</li>
                    <li><code>durationUnit</code> can be: <code>Days</code>, <code>Weeks</code>, <code>Fortnights</code>, <code>Months</code>, <code>Years</code>.</li>
                    <li><code>repaymentType</code> can be: <code>Equal Installments</code> or <code>Balloon Payment</code>.</li>
                    <li><code>repaymentFrequency</code> can be: <code>Daily</code>, <code>Weekly</code>, <code>Fortnightly</code>, <code>Monthly</code>.</li>
                    <li><code>status</code> can be: <code>Pending</code>, <code>Active</code>, or <code>Completed</code>.</li>
                </ul>
                <pre className="bg-muted p-2 rounded-md mt-2 text-xs overflow-x-auto"><code>{`dealName,clientEmail,principal,profitRate,durationValue,durationUnit,repaymentType,repaymentFrequency,status,createdAt
Q1 Expansion,john.doe@example.com,50000,10,12,Months,Equal Installments,Monthly,Active,2023-01-15`}</code></pre>
            </div>

            <div className="mt-6">
                <h4 className="font-semibold text-foreground">3. Investments File (<code>investments.csv</code>)</h4>
                <p>Links investors to the deals they have funded.</p>
                <ul className="list-disc pl-5">
                    <li><strong>Required Columns:</strong> <code className="bg-muted p-1 rounded-sm break-words">investorEmail, dealName, amount, createdAt</code></li>
                    <li><code>investorEmail</code> must match an investor's email from your <code>users.csv</code>.</li>
                    <li><code>dealName</code> must match a name from your <code>deals.csv</code>.</li>
                </ul>
                <pre className="bg-muted p-2 rounded-md mt-2 text-xs overflow-x-auto"><code>{`investorEmail,dealName,amount,createdAt
jane.smith@example.com,Q1 Expansion,25000,2023-01-20`}</code></pre>
            </div>
        </div>
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
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import"><Upload className="mr-2 h-4 w-4" />Import Data</TabsTrigger>
          <TabsTrigger value="instructions"><Info className="mr-2 h-4 w-4" />Instructions</TabsTrigger>
        </TabsList>
        <TabsContent value="import" className="mt-4">
            <Alert>
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                    Please import files in the correct order: 1. Users, 2. Deals, 3. Investments. For detailed instructions, see the "Instructions" tab.
                </AlertDescription>
            </Alert>
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3 mt-4">
                <ImportCard
                    title="1. Users"
                    description="Import clients and investors. This step must be completed first."
                    action={importUsersAction}
                    icon={Users}
                    requiredFields={['name', 'email', 'role']}
                />
                <ImportCard
                    title="2. Deals"
                    description="Import financing deals. Requires users to be imported first."
                    action={importDealsAction}
                    icon={FileText}
                    requiredFields={['dealName', 'clientEmail', 'principal', 'profitRate', 'durationValue', 'durationUnit', 'repaymentType', 'repaymentFrequency', 'status', 'createdAt']}
                />
                <ImportCard
                    title="3. Investments"
                    description="Link investors to deals. Requires users and deals to be imported."
                    action={importInvestmentsAction}
                    icon={Landmark}
                    requiredFields={['investorEmail', 'dealName', 'amount', 'createdAt']}
                />
            </div>
        </TabsContent>
        <TabsContent value="instructions" className="mt-4">
             <Card>
                <CardHeader>
                    <CardTitle>How to Prepare Your Data</CardTitle>
                    <CardDescription>Follow these instructions to ensure a smooth data migration.</CardDescription>
                </CardHeader>
                <CardContent>
                    <InstructionContent />
                </CardContent>
             </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
