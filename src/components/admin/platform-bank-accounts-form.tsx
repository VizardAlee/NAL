'use client';
import { useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getRequiredIdToken } from '@/firebase/auth-token';
import { useToast } from '@/hooks/use-toast';
import { platformBankAccounts, defaultPlatformBankAccount, type PlatformBankAccount } from '@/lib/platform-bank-accounts';
import { setPlatformBankAccountsAction } from '@/app/admin/settings/bank-details-actions';

export function PlatformBankAccountsForm({currentDetails,isLoading}:{currentDetails:unknown;isLoading:boolean}) {
  const [accounts,setAccounts] = useState<PlatformBankAccount[]>([]);
  const [defaultId,setDefaultId] = useState('');
  const [dirty,setDirty] = useState(false);
  const [busy,setBusy] = useState(false);
  const [revision,setRevision] = useState(0);
  const {toast} = useToast();
  useEffect(() => {if (!isLoading && !dirty) {setAccounts(platformBankAccounts(currentDetails,true));setDefaultId(defaultPlatformBankAccount(currentDetails)?.id || '');setRevision(Number((currentDetails as {revision?:number} | null)?.revision || 0));}},[currentDetails,isLoading,dirty]);
  const update = (id:string, patch:Partial<PlatformBankAccount>) => {setDirty(true);setAccounts(current=>current.map(item=>item.id===id?{...item,...patch}:item));};
  return <Card><CardHeader><CardTitle>NAL Payment Accounts</CardTitle><CardDescription>Add verified NAL-owned bank accounts. Users can choose any active account. Deactivate an old account instead of deleting its history; the default is used in notices and new agreements.</CardDescription></CardHeader><CardContent className="space-y-4">
    {isLoading ? <p>Loading accounts…</p> : <form className="space-y-4" onSubmit={async event=>{event.preventDefault();setBusy(true);try {const result=await setPlatformBankAccountsAction(await getRequiredIdToken(),{accounts,defaultAccountId:defaultId,revision});if(!result.success)throw new Error(result.message);setRevision(result.revision!);setDirty(false);toast({title:'Payment accounts saved'});} catch(error){toast({variant:'destructive',title:'Accounts not saved',description:error instanceof Error?error.message:'Please retry.'});}finally{setBusy(false);}}}>
      {accounts.map((account,index)=><fieldset disabled={busy} key={account.id} className="space-y-3 rounded-lg border p-4"><legend className="px-2 text-sm">Account {index+1}</legend><div className="grid gap-3 md:grid-cols-3"><label>Bank name<Input required value={account.bankName} onChange={event=>update(account.id,{bankName:event.target.value})} /></label><label>Account name<Input required value={account.accountName} onChange={event=>update(account.id,{accountName:event.target.value})} /></label><label>Account number<Input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={account.accountNumber} onChange={event=>update(account.id,{accountNumber:event.target.value})} /></label></div><div className="flex flex-wrap gap-4"><label><input type="checkbox" checked={account.active} onChange={event=>update(account.id,{active:event.target.checked})} /> Available for payments</label><label><input type="radio" name="defaultAccount" checked={defaultId===account.id} disabled={!account.active} onChange={()=>{setDirty(true);setDefaultId(account.id);}} /> Default account</label></div></fieldset>)}
      <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={busy || accounts.length>=20} onClick={()=>{const id=crypto.randomUUID();setDirty(true);setAccounts([...accounts,{id,bankName:'',accountName:'',accountNumber:'',active:true}]);if(!defaultId)setDefaultId(id);}}><Plus className="mr-2 h-4 w-4" />Add account</Button><Button disabled={busy || !dirty}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save payment accounts</Button><Button type="button" variant="ghost" disabled={busy || !dirty} onClick={()=>setDirty(false)}>Discard changes</Button></div>
    </form>}
  </CardContent></Card>;
}
