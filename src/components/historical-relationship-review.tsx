'use client';

import type { HistoricalAgreementLink, HistoricalExtraction, HistoricalRelatedParty } from '@/lib/historical-import';
import { importedPartyRef } from '@/lib/historical-relationships';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';

type User = {id:string;name:string;role:string;personas:string[]};
const selectClass = 'h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm';
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="grid min-w-0 gap-1.5 text-sm">{label}{children}</label>;}

export function HistoricalRelationshipReview({extraction,onChange,documents,users,disabled}:{extraction:HistoricalExtraction;onChange:(value:HistoricalExtraction)=>void;documents:Array<{id:string;originalName:string}>;users:User[];disabled:boolean}) {
  const parties = extraction.relatedParties || [];
  const links = extraction.agreementLinks || [];
  const updateParty = (index:number,patch:Partial<HistoricalRelatedParty>) => onChange({...extraction,relatedParties:parties.map((item,i)=> i===index ? {...item,...patch,confirmed:false}:item)});
  const updateLink = (index:number,patch:Partial<HistoricalAgreementLink>) => onChange({...extraction,agreementLinks:links.map((item,i)=>i===index?{...item,...patch,confirmed:false}:item)});
  return <>
    <Card><CardHeader><CardTitle>People and accounts</CardTitle><CardDescription>One profile per customer—not per document. Guarantors and witnesses remain agreement parties, not client/investor accounts. Existing accounts are never overwritten. New profiles stay unclaimed until invited; identity/KYC still needs separate verification.</CardDescription></CardHeader><CardContent className="space-y-4">
      {extraction.party.accountType === 'Organization' && <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3"><p className="md:col-span-3 font-semibold">Primary organisation: {extraction.party.name}</p>{(['organizationRegistrationNumber','representativeName','representativeTitle'] as const).map(field=><Field key={field} label={{organizationRegistrationNumber:'Registration number',representativeName:'Authorised representative',representativeTitle:'Representative capacity'}[field]}><Input disabled={disabled} value={extraction.party[field] || ''} onChange={e=>onChange({...extraction,party:{...extraction.party,[field]:e.target.value}})}/></Field>)}</div>}
      {parties.map((party,index)=><section key={party.id} className="space-y-3 rounded-lg border p-4">
        <p className="font-semibold">{party.name || 'New customer'} · {importedPartyRef(party.id)}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Legal customer / organisation name"><Input disabled={disabled} value={party.name} onChange={e=>updateParty(index,{name:e.target.value})}/></Field>
          <Field label="Business relationship"><select className={selectClass} disabled={disabled} value={party.kind} onChange={e=>updateParty(index,{kind:e.target.value as HistoricalRelatedParty['kind'],existingUserId:'',createNew:false})}><option>CLIENT</option><option>INVESTOR</option><option>BOTH</option></select></Field>
          <Field label="Account choice"><select className={selectClass} disabled={disabled} value={party.createNew?'new':party.existingUserId || ''} onChange={e=>updateParty(index,{createNew:e.target.value==='new',existingUserId:e.target.value==='new'?'':e.target.value})}><option value="">Choose an account</option><option value="new">Create new unclaimed profile</option>{users.filter(user=>(party.kind==='BOTH'?['CLIENT','INVESTOR']:[party.kind]).every(kind=>user.personas.includes(kind)||user.role.toUpperCase()===kind)).map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
          <Field label="Individual or organisation"><select className={selectClass} disabled={disabled} value={party.accountType} onChange={e=>updateParty(index,{accountType:e.target.value as HistoricalRelatedParty['accountType']})}><option>Individual</option><option>Organization</option></select></Field>
          <Field label="Email for later invitation"><Input disabled={disabled} type="email" value={party.email || ''} onChange={e=>updateParty(index,{email:e.target.value})}/></Field>
          <Field label="Phone"><Input disabled={disabled} value={party.phoneNumber || ''} onChange={e=>updateParty(index,{phoneNumber:e.target.value})}/></Field>
          <Field label="Address"><Input disabled={disabled} value={party.address || ''} onChange={e=>updateParty(index,{address:e.target.value})}/></Field>
          {party.accountType==='Organization' && <><Field label="Registration number"><Input disabled={disabled} value={party.organizationRegistrationNumber || ''} onChange={e=>updateParty(index,{organizationRegistrationNumber:e.target.value})}/></Field><Field label="Authorised representative"><Input disabled={disabled} value={party.representativeName || ''} onChange={e=>updateParty(index,{representativeName:e.target.value})}/></Field><Field label="Representative capacity"><Input disabled={disabled} value={party.representativeTitle || ''} onChange={e=>updateParty(index,{representativeTitle:e.target.value})}/></Field></>}
        </div>
        <label className="flex items-start gap-2 text-sm"><Checkbox disabled={disabled} checked={party.confirmed} onCheckedChange={checked=>onChange({...extraction,relatedParties:parties.map((item,i)=>i===index?{...item,confirmed:checked===true}:item)})}/>I verified the customer identity and account choice. This is not a duplicate account.</label>
        <Button disabled={disabled} variant="outline" onClick={()=>onChange({...extraction,relatedParties:parties.filter((_,i)=>i!==index)})}>Remove duplicate / unrelated party</Button>
      </section>)}
      <Button disabled={disabled} variant="outline" onClick={()=>onChange({...extraction,relatedParties:[...parties,{id:crypto.randomUUID(),name:'',kind:'CLIENT',accountType:'Individual',createNew:false,confirmed:false}]})}>Add another customer</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Document relationships</CardTitle><CardDescription>Confirm every source file and its deal or investment contract. Wakalah grants procurement agency only for the linked deal. Kafaalah records its guarantor. Neither creates a deal or payment. A PDF with different customers must be split before sharing it with customers.</CardDescription></CardHeader><CardContent className="space-y-4">
      {links.map((link,index)=><section key={link.id} className="space-y-3 rounded-lg border p-4"><div className="grid gap-3 md:grid-cols-3">
        <Field label="Uploaded source file"><select className={selectClass} disabled={disabled} value={link.documentId} onChange={e=>updateLink(index,{documentId:e.target.value})}><option value="">Select source</option>{documents.map(doc=><option key={doc.id} value={doc.id}>{doc.originalName}</option>)}</select></Field>
        <Field label="Agreement / evidence type"><select className={selectClass} disabled={disabled} value={link.type} onChange={e=>updateLink(index,{type:e.target.value as HistoricalAgreementLink['type'],dealId:'',fundPositionId:''})}>{['MUDARABA','MURABAHA','WAKALAH','KAFAALAH','OTHER'].map(type=><option key={type}>{type}</option>)}</select></Field>
        {link.type==='MUDARABA' ? <Field label="Original investment contract"><select className={selectClass} disabled={disabled} value={link.fundPositionId} onChange={e=>updateLink(index,{fundPositionId:e.target.value})}><option value="">Select contract</option>{extraction.fundPositions.map((position,i)=><option key={position.id || i} value={position.id || `fund-${i+1}`}>{position.investorName} · {position.investmentTerms?.paymentReference || `Contract ${i+1}`}</option>)}</select></Field> : link.type!=='OTHER' && <Field label="Related client deal"><select className={selectClass} disabled={disabled} value={link.dealId} onChange={e=>updateLink(index,{dealId:e.target.value})}><option value="">Select deal</option>{extraction.deals.map(deal=><option key={deal.id} value={deal.id}>{deal.dealName} · {deal.clientName}</option>)}</select></Field>}
        <Field label="Agreement reference"><Input disabled={disabled} value={link.reference} onChange={e=>updateLink(index,{reference:e.target.value})}/></Field>
        <Field label="Agreement date"><Input disabled={disabled} type="date" value={link.date} onChange={e=>updateLink(index,{date:e.target.value})}/></Field>
        <Field label="Customer / investor named"><Input disabled={disabled} value={link.partyName} onChange={e=>updateLink(index,{partyName:e.target.value})}/></Field>
        {link.type==='WAKALAH' && <><Field label="Procurement asset"><Input disabled={disabled} value={link.assetDescription} onChange={e=>updateLink(index,{assetDescription:e.target.value})}/></Field><Field label="Supplier"><Input disabled={disabled} value={link.supplierName} onChange={e=>updateLink(index,{supplierName:e.target.value})}/></Field></>}
        {link.type==='KAFAALAH' && <>{(['guarantorName','guarantorAddress','guarantorPhoneNumber','guarantorOccupation'] as const).map(field=><Field key={field} label={{guarantorName:'Guarantor name',guarantorAddress:'Guarantor address',guarantorPhoneNumber:'Guarantor phone',guarantorOccupation:'Guarantor occupation'}[field]}><Input disabled={disabled} value={link[field]} onChange={e=>updateLink(index,{[field]:e.target.value})}/></Field>)}</>}
      </div><Field label="Why this document belongs to this record (reference, parties, asset, dates)"><Textarea disabled={disabled} value={link.evidence} onChange={e=>updateLink(index,{evidence:e.target.value})}/></Field>
      <label className="flex items-start gap-2 text-sm"><Checkbox disabled={disabled} checked={link.confirmed} onCheckedChange={checked=>onChange({...extraction,agreementLinks:links.map((item,i)=>i===index?{...item,confirmed:checked===true}:item)})}/>I verified the source and relationship. For agency/guarantee documents, I checked the authority and execution evidence. A stamp alone is not proof of signing.</label>
      <Button disabled={disabled} variant="outline" onClick={()=>onChange({...extraction,agreementLinks:links.filter((_,i)=>i!==index)})}>Remove agreement entry</Button>
      </section>)}
      <Button disabled={disabled} variant="outline" onClick={()=>onChange({...extraction,agreementLinks:[...links,{id:crypto.randomUUID(),documentId:'',type:'OTHER',dealId:'',fundPositionId:'',reference:'',date:'',partyName:'',guarantorName:'',guarantorAddress:'',guarantorPhoneNumber:'',guarantorOccupation:'',assetDescription:'',supplierName:'',evidence:'',confirmed:false}]})}>Add document relationship</Button>
    </CardContent></Card>
  </>;
}
