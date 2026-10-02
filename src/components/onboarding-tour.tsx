'use client';
import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {BookOpen, ArrowRight, ArrowLeft, Check, CircleHelp, ExternalLink, ShieldCheck, Upload, Landmark, FileText, UserRound, ChartNoAxesCombined, RotateCcw} from 'lucide-react';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle, CardDescription} from '@/components/ui/card';
import {useUser} from '@/firebase';
import {useLanguage} from '@/components/language-provider';
import {canAccessPortal, canWriteAdmin, isPrimaryPortal, type PrimaryPortal} from '@/lib/access-control';
import {guideLabels, guideStorageKey, parseGuideProgress, userGuideTopics, type GuideProgress, type GuideTopic} from '@/lib/user-guide';
import type {SupportedLanguage} from '@/lib/localization';

const Context = createContext<{showTour:()=>void}|null>(null);
const icons = {profile:UserRound, bank:Landmark, receipt:Upload, signature:FileText, schedule:ChartNoAxesCombined, workflow:ShieldCheck, dashboard:BookOpen};
const stages:Record<string,Record<SupportedLanguage,string[]>> = {
  receipt:{en:['Upload','Submit','Bank match','Admin approval'],ha:['Saka','Aika','Daidaita banki','Amincewar admin'],ig:['Bulite','Zipụ','Njikọ ụlọ akụ','Nkwado admin'],yo:['Gbé sókè','Fi ránṣẹ́','Ìbámu báńkì','Ìfọwọ́sí admin']},
  workflow:{en:['Prepare','Review','Confirm'],ha:['Shirya','Duba','Tabbatar'],ig:['Kwadebe','Nyochaa','Kwenye'],yo:['Pèsè','Ṣàyẹ̀wò','Jẹ́rìí']},
};

/** Teaching graphics have no personal data and do not operate the live workflow. */
export function GuideIllustration({topic,language}:{topic:GuideTopic;language:SupportedLanguage}) {
  const Icon = icons[topic.visual];
  const [replay,setReplay] = useState(0);
  const labels = stages[topic.visual] || stages.workflow;
  return <figure className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4 sm:p-5">
    <figcaption className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{guideLabels.example[language]}</figcaption>
    {topic.visual==='signature' ? <div>
      <div className="rounded-xl border bg-white p-3 shadow-sm"><svg key={replay} viewBox="0 0 420 120" role="img" aria-label={topic.title[language]} className="h-28 w-full"><path d="M20 96 H400" stroke="#cbd5e1" strokeDasharray="5 5"/><path className="nal-guide-signature" pathLength="1" d="M50 80 C62 55 80 15 86 42 C90 75 49 104 76 83 C98 57 108 45 106 64 C104 79 121 45 125 56 C129 72 143 55 151 59 C163 65 166 86 181 65 C190 54 209 16 210 35 C209 56 172 98 200 78 C220 62 225 50 228 65 C230 77 242 57 251 64 C261 77 272 58 289 68 C300 80 316 75 335 62 M136 98 C185 90 256 94 354 84" fill="none" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round"/></svg></div>
      <Button type="button" className="mt-3" size="sm" variant="outline" onClick={()=>setReplay(value=>value+1)}><RotateCcw className="mr-2 h-3 w-3" />{guideLabels.restart[language]}</Button>
    </div> : <>
      <div aria-hidden="true" className="mb-4 rounded-xl border bg-background p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 border-b pb-3"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">NAL</span><span className="h-2.5 w-28 rounded bg-muted"/><span className="ml-auto h-6 w-6 rounded-full bg-primary/15"/></div>
        {topic.visual==='schedule' ? <div className="grid grid-cols-4 gap-2">{Array.from({length:12},(_,index)=><span key={index} className={`h-4 rounded ${index<4?'bg-primary/30':'bg-muted'}`}/>)}</div> : topic.visual==='bank' ? <div className="grid grid-cols-2 gap-3">{[1,2].map(index=><div key={index} className={`rounded-lg border p-3 ${index===2?'border-primary bg-primary/5':'bg-muted/30'}`}><Landmark className="mb-2 h-5 w-5 text-primary"/><div className="h-2 w-3/4 rounded bg-muted"/><p className="mt-2 font-mono text-sm">••••••••••</p><div className="mt-2 h-5 rounded bg-primary/15"/></div>)}</div> : <div className="flex gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-8 w-8 text-primary"/></div><div className="flex-1 space-y-2"><div className="h-3 w-3/4 rounded bg-muted"/><div className="h-3 w-full rounded bg-muted"/><div className="h-3 w-1/2 rounded bg-muted"/><div className="h-6 w-24 rounded bg-primary/20"/></div></div>}
      </div>
      <ol aria-label={topic.title[language]} className={`grid gap-2 ${labels[language].length===4?'grid-cols-2 sm:grid-cols-4':'grid-cols-3'}`}>{labels[language].map((label,index)=><li key={label} className="min-w-0 rounded-lg border bg-background/80 p-2 text-center"><span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index+1}</span><span className="block break-words text-[11px] font-medium leading-4">{label}</span></li>)}</ol>
    </>}
  </figure>;
}
export function GuideTopicPanel({topic,language}:{topic:GuideTopic;language:SupportedLanguage}) {
  return <div className="space-y-5"><h3 className="text-xl font-semibold sm:text-2xl">{topic.title[language]}</h3><GuideIllustration topic={topic} language={language}/><ol className="space-y-3">{topic.steps.map((step,index)=><li key={index} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index+1}</span><p className="text-sm leading-6">{step[language]}</p></li>)}</ol><aside className="rounded-xl border border-amber-400/40 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"><p className="mb-1 font-semibold">{guideLabels.tip[language]}</p>{topic.tip[language]}</aside></div>;
}

export function UserGuideDialog({topics,language,progress,onProgress:onSave,onDismiss,canSave=true,open,portal,sectionLinks=true}:{topics:GuideTopic[];language:SupportedLanguage;progress:GuideProgress;onProgress:(next:GuideProgress)=>void;onDismiss:()=>void;canSave?:boolean;open:boolean;portal:PrimaryPortal;sectionLinks?:boolean}) {
  const current=topics[Math.min(progress.index,topics.length-1)];
  const href=current.href.startsWith('/')?current.href:`/${portal}/${current.href}`;
  const save=onSave;
  const dismiss=onDismiss;
  const isRead=progress.read.includes(current.id);
  const complete=progress.read.length===topics.length;
  return (
    <Dialog open={open} onOpenChange={next=>{if(!next)dismiss();}}><DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b p-4 pr-10 text-left sm:p-6 sm:pr-12"><DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 shrink-0 text-primary"/>{guideLabels.title[language]}</DialogTitle><DialogDescription>{guideLabels.intro[language]}</DialogDescription><div className="pt-2"><p className="mb-2 text-xs text-muted-foreground">{complete?guideLabels.ready[language]:guideLabels.topics[language]} · {progress.read.length}/{topics.length}</p><div role="progressbar" aria-label={guideLabels.read[language]} aria-valuemin={0} aria-valuemax={topics.length} aria-valuenow={progress.read.length} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{width:`${progress.read.length/topics.length*100}%`}}/></div></div></DialogHeader>
      <div className="flex min-h-0 flex-1 overflow-hidden"><nav aria-label={guideLabels.topics[language]} className="hidden w-60 shrink-0 overflow-y-auto border-r p-3 md:block"><ol className="space-y-1">{topics.map((topic,index)=><li key={topic.id}><button type="button" onClick={()=>save({...progress,index})} aria-current={index===progress.index?'step':undefined} className={`flex w-full items-start gap-2 rounded-lg p-3 text-left text-xs leading-5 hover:bg-muted ${index===progress.index?'bg-primary/10 font-semibold text-primary':''}`}><span className="shrink-0">{progress.read.includes(topic.id)?<Check className="mt-0.5 h-4 w-4" aria-label={guideLabels.read[language]}/>:index+1}</span>{topic.title[language]}</button></li>)}</ol></nav>
        <section className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-live="polite" aria-atomic="false"><label className="mb-4 block text-xs font-medium md:hidden">{guideLabels.topics[language]}<select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={progress.index} onChange={event=>save({...progress,index:Number(event.target.value)})}>{topics.map((topic,index)=><option key={topic.id} value={index}>{index+1}. {topic.title[language]}</option>)}</select></label><GuideTopicPanel topic={current} language={language}/><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={isRead} onChange={event=>save({...progress,read:event.target.checked?[...new Set([...progress.read,current.id])]:progress.read.filter(id=>id!==current.id)})}/>{guideLabels.read[language]}</label>{sectionLinks && <Button variant="outline" asChild><Link href={href} onClick={dismiss}><ExternalLink className="mr-2 h-4 w-4"/>{guideLabels.open[language]}</Link></Button>}</div></section>
      </div>
      <footer className="shrink-0 space-y-3 border-t bg-background p-4"><p className="text-xs text-muted-foreground">{canSave?guideLabels.saved[language]:guideLabels.unavailable[language]}</p><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={dismiss}>{guideLabels.later[language]}</Button><Button variant="ghost" size="sm" onClick={()=>save({index:0,read:[],dismissed:false})}><RotateCcw className="mr-1 h-3 w-3"/>{guideLabels.restart[language]}</Button></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={progress.index===0} onClick={()=>save({...progress,index:progress.index-1})}><ArrowLeft className="mr-1 h-4 w-4"/>{guideLabels.back[language]}</Button><Button size="sm" onClick={()=>{if(progress.index===topics.length-1)dismiss();else save({...progress,index:progress.index+1});}}>{progress.index===topics.length-1?guideLabels.finish[language]:guideLabels.next[language]}<ArrowRight className="ml-1 h-4 w-4"/></Button></div></div></footer>
    </DialogContent></Dialog>
  );
}
export function OnboardingTourProvider({children}:{children:React.ReactNode}) {
  const {user} = useUser();
  const pathname = usePathname();
  const {language} = useLanguage();
  const candidate = pathname.split('/')[1];
  const portal:PrimaryPortal = isPrimaryPortal(candidate)?candidate:'client';
  const allowed = Boolean(user && isPrimaryPortal(candidate) && canAccessPortal(user,portal));
  const readOnly = portal==='admin' && !canWriteAdmin(user);
  const topics = useMemo(()=>userGuideTopics(portal,readOnly),[portal,readOnly]);
  const key = allowed && user ? guideStorageKey(user.uid,portal,readOnly):'';
  const [open,setOpen] = useState(false);
  const [loadedKey,setLoadedKey] = useState('');
  const [progress,setProgress] = useState<GuideProgress>({index:0,read:[],dismissed:false});
  const [canSave,setCanSave] = useState(true);
  useEffect(()=>{
    setOpen(false);setLoadedKey(key);
    if(!key)return;
    try {const state=parseGuideProgress(localStorage.getItem(key),topics);setProgress(state);setCanSave(true);setOpen(!state.dismissed&&state.read.length<topics.length);}catch{setProgress({index:0,read:[],dismissed:false});setCanSave(false);setOpen(true);}
  },[key,topics]);
  const visible = allowed && loadedKey===key;
  const save = (next:GuideProgress)=>{setProgress(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{setCanSave(false);}};
  const dismiss = ()=>{save({...progress,dismissed:true});setOpen(false);};
  const showTour = ()=>{if(visible)setOpen(true);};
  const complete = progress.read.length===topics.length;
  return <Context.Provider value={{showTour}}>{children}
    {visible && <Button type="button" onClick={showTour} className="fixed bottom-24 right-3 z-30 gap-2 rounded-full shadow-lg lg:bottom-6 lg:right-6" aria-label={guideLabels.guide[language]}><CircleHelp className="h-4 w-4"/><span>{guideLabels.guide[language]}</span>{!complete&&<span className="h-2 w-2 rounded-full bg-primary-foreground" aria-hidden="true"/>}</Button>}
    <UserGuideDialog open={visible&&open} topics={topics} language={language} progress={progress} onProgress={save} onDismiss={dismiss} canSave={canSave} portal={portal}/>
  </Context.Provider>;
}
export function useOnboardingTour() {const context=useContext(Context);if(!context)throw new Error('User guide requires OnboardingTourProvider.');return context;}
export function UserGuideSettingsCard() {
  const {showTour}=useOnboardingTour();const {language}=useLanguage();
  return <Card><CardHeader><CardTitle>{guideLabels.guide[language]}</CardTitle><CardDescription>{guideLabels.settings[language]}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={showTour}><BookOpen className="mr-2 h-4 w-4"/>{guideLabels.guide[language]}</Button></CardContent></Card>;
}
