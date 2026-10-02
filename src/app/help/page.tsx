'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {BookOpen,ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {useLanguage} from '@/components/language-provider';
import {UserGuideDialog} from '@/components/onboarding-tour';
import {guideLabels,parseGuideProgress,userGuideTopics,type GuideProgress} from '@/lib/user-guide';
import type {PrimaryPortal} from '@/lib/access-control';

/** Public training material only: never loads profiles, balances or financial records. */
export default function HelpPage() {
  const {language,tx}=useLanguage();
  const [portal,setPortal]=useState<PrimaryPortal>('client');
  const [open,setOpen]=useState(false);
  const [progress,setProgress]=useState<GuideProgress>({index:0,read:[],dismissed:false});
  const [canSave,setCanSave]=useState(true);
  const topics=useMemo(()=>userGuideTopics(portal),[portal]);
  const key=`nal-public-guide-v1:${portal}`;
  useEffect(()=>{try{setProgress(parseGuideProgress(localStorage.getItem(key),topics));setCanSave(true);}catch{setProgress({index:0,read:[],dismissed:false});setCanSave(false);}},[key,topics]);
  const save=(next:GuideProgress)=>{setProgress(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{setCanSave(false);}};
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 py-10 sm:p-8">
    <Button variant="ghost" asChild><Link href="/"><ArrowLeft className="mr-2 h-4 w-4"/>NAL</Link></Button>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-6 w-6 text-primary"/>{guideLabels.title[language]}</CardTitle><CardDescription>{guideLabels.intro[language]}</CardDescription></CardHeader><CardContent className="space-y-5">
      <p className="rounded-lg bg-muted p-3 text-sm">{guideLabels.example[language]}</p>
      <label className="block text-sm">{tx('Role')}<select aria-label={tx('Role')} value={portal} onChange={event=>setPortal(event.target.value as PrimaryPortal)} className="mt-2 h-11 w-full rounded-md border bg-background px-3">{(['client','investor','admin','owner','recovery','legal','marketer'] as const).map(role=><option key={role} value={role}>{tx(role[0].toUpperCase()+role.slice(1))}</option>)}</select></label>
      <Button onClick={()=>setOpen(true)}><BookOpen className="mr-2 h-4 w-4"/>{guideLabels.guide[language]}</Button>
      <ol className="grid gap-2 sm:grid-cols-2">{topics.map((topic,index)=><li key={topic.id}><button className="w-full rounded-lg border p-3 text-left text-sm hover:bg-muted" onClick={()=>{save({...progress,index});setOpen(true);}}>{index+1}. {topic.title[language]}</button></li>)}</ol>
    </CardContent></Card>
    <UserGuideDialog open={open} portal={portal} topics={topics} language={language} progress={progress} onProgress={save} onDismiss={()=>{save({...progress,dismissed:true});setOpen(false);}} canSave={canSave} sectionLinks={false}/>
  </main>;
}
