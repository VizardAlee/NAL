
'use client';

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, PlusCircle, Landmark, History } from "lucide-react";
import { Naira } from "@/components/icons";

// Mock data, to be replaced with Firestore data
const transactions = [
  { id: 'T01', date: '2024-07-20', type: 'Profit Distribution', deal: 'TechCorp Series A', amount: 15000 },
  { id: 'T02', date: '2024-07-15', type: 'Investment', deal: 'GreenEnergy Loan', amount: -250000 },
  { id: 'T03', date: '2024-07-01', type: 'Deposit', deal: 'N/A', amount: 500000 },
  { id: 'T04', date: '2024-06-20', type: 'Profit Distribution', deal: 'Retail Expansion Fund', amount: 12000 },
];

export default function InvestorDashboard() {
  return (
    <div>
      <PageHeader
        title="Investor Dashboard"
        description="Welcome to your personal investment hub."
        icon={Landmark}
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Funds
        </Button>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Capital</CardTitle>
            <Naira className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦1,250,000.00</div>
            <p className="text-xs text-muted-foreground">Total funds deposited</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
            <Naira className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦1,327,500.00</div>
            <p className="text-xs text-muted-foreground">+6.2% all-time return</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annualized Return</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12.8%</div>
            <p className="text-xs text-muted-foreground">Based on current performance</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Related Deal</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{tx.date}</TableCell>
                  <TableCell>
                    <Badge variant={tx.type === 'Deposit' || tx.type === 'Profit Distribution' ? 'secondary' : 'outline'}>{tx.type}</Badge>
                  </TableCell>
                  <TableCell>{tx.deal}</TableCell>
                  <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-green-500' : 'text-foreground'}`}>
                    {tx.amount > 0 ? '+' : ''}{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(tx.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
