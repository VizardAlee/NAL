'use client';

import { useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Landmark, Copy } from 'lucide-react';
import { useDoc, useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { defaultPlatformBankAccount, platformBankAccounts } from '@/lib/platform-bank-accounts';

export function PlatformBankDetailsCard() {
  const firestore = useFirestore();
  const ref = useMemo(() => firestore ? doc(firestore, 'platformSettings', 'bankDetails') : null, [firestore]);
  const { data, loading } = useDoc(ref);
  const [selected, setSelected] = useState('');
  const { toast } = useToast();
  const accounts = platformBankAccounts(data);
  const account = accounts.find(item => item.id === selected) || defaultPlatformBankAccount(data);
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Landmark /> NAL Payment Accounts</CardTitle><CardDescription>Choose a NAL account for your deposit or repayment. Upload your receipt after paying.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm">
    {loading ? <Skeleton className="h-20 w-full" /> : !account ? <p>No receiving accounts are currently available. Contact NAL before paying.</p> : <>
      <label className="block">Pay to<select aria-label="Choose NAL payment account" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={account.id} onChange={event => setSelected(event.target.value)}>{accounts.map(item => <option key={item.id} value={item.id}>{item.bankName} · {item.accountNumber}</option>)}</select></label>
      <div><p className="text-muted-foreground">Bank Name</p><p className="font-medium">{account.bankName}</p></div>
      <div><p className="text-muted-foreground">Account Name</p><p className="font-medium">{account.accountName}</p></div>
      <div className="flex items-center justify-between"><div><p className="text-muted-foreground">Account Number</p><p className="font-medium">{account.accountNumber}</p></div><Button variant="ghost" size="icon" aria-label="Copy NAL account number" onClick={async () => {try {await navigator.clipboard.writeText(account.accountNumber);toast({title:'Account number copied'});} catch {toast({variant:'destructive',title:'Copy unavailable',description:'Select and copy the account number manually.'});}}}><Copy className="h-4 w-4" /></Button></div>
    </>}
  </CardContent></Card>;
}
