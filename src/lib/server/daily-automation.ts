import 'server-only';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { assertAutomationJobsSucceeded } from '@/lib/automation-result';

type Job = () => Promise<Record<string, any>>;
export type DailyJobs = { zakat: Job; recovery: Job; marketerRating: Job; ownerProfit: Job; whatsappReminders: Job };
const names = ['zakat','recovery','marketerRating','ownerProfit','whatsappReminders'] as const;
const message = (error: unknown) => error instanceof Error ? error.message : 'Unknown automation error';
const summarize = (result: Record<string, any>) => Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'details'));

/** Reporting never retries business work. Initial jobs remain parallel; later
 * stages retain their original failure gates. All started jobs settle before the
 * HTTP result, so a failed sibling cannot hide another component's completion.
 */
export async function executeDailyAutomation(db: Firestore, jobs: DailyJobs) {
  const run = db.collection('automationRuns').doc();
  const health = db.doc('automationHealth/daily');
  const startedAt = Timestamp.now();
  const components: Record<string, any> = Object.fromEntries(names.map(name => [name,{status:'NOT_STARTED'}]));
  const results: Record<string, any> = {}; const summary: Record<string, any> = {};
  const reportingErrors: string[] = [];
  async function report(name: string, value: Record<string, any>) {
    components[name] = value;
    try {
      await run.update({[`components.${name}`]:value, ...(value.summary ? {[`summary.${name}`]:value.summary} : {})});
      await db.runTransaction(async tx => {
        const current = await tx.get(health);
        if (current.data()?.lastRunId === run.id) tx.update(health,{[`components.${name}`]:value,...(value.summary ? {[`summary.${name}`]:value.summary} : {})});
      });
    }
    catch (error) { reportingErrors.push(`${name}: ${message(error)}`); console.error('Automation component reporting failed', name, message(error)); }
  }
  async function execute(name: typeof names[number]) {
    const begin = Timestamp.now();
    await report(name,{status:'RUNNING',startedAt:begin});
    try {
      const result = await jobs[name](); results[name] = result; summary[name] = summarize(result);
      assertAutomationJobsSucceeded({[name]:result});
      await report(name,{status:'SUCCEEDED',startedAt:begin,completedAt:Timestamp.now(),summary:summary[name]});
      return result;
    } catch (error) {
      await report(name,{status:'FAILED',startedAt:begin,failedAt:Timestamp.now(),error:message(error),...(summary[name] ? {summary:summary[name]} : {})});
      throw error;
    }
  }
  let failure: unknown;
  try {
    await db.runTransaction(async tx => {
      const current = await tx.get(health);
      tx.set(run,{status:'RUNNING',startedAt,source:'runDailyAutomation',components});
      const previousStart = current.data()?.lastStartedAt?.toMillis?.() ?? -1;
      if (previousStart < startedAt.toMillis() || (previousStart === startedAt.toMillis() && String(current.data()?.lastRunId || '') < run.id)) tx.set(health,{status:'RUNNING',lastStartedAt:startedAt,lastRunId:run.id,lastError:FieldValue.delete(),summary:{},components},{mergeFields:['status','lastStartedAt','lastRunId','lastError','summary','components']});
    });
    const initial = await Promise.allSettled([execute('zakat'),execute('recovery'),execute('marketerRating')]);
    const failed = initial.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    await execute('ownerProfit');
    await execute('whatsappReminders');
  } catch (error) { failure = error; }
  if (reportingErrors.length && !failure) failure = Error('Automation reporting failed. Completed work has not been rolled back.');
  const completedAt = Timestamp.now();
  const terminal = failure ? {status:'FAILED',failedAt:completedAt,error:message(failure)} : {status:'SUCCEEDED',completedAt};
  try {
    await db.runTransaction(async tx => {
      const current = await tx.get(health);
      tx.set(run,{...terminal,startedAt,source:'runDailyAutomation',summary,components,reportingErrors},{mergeFields:[...Object.keys(terminal),'startedAt','source','summary','components','reportingErrors']});
      // An older run always retains its own result, but cannot replace a newer
      // run's dashboard status. Historical success/failure timestamps survive.
      if (current.data()?.lastRunId === run.id) tx.set(health,{
        status:failure ? 'FAILED' : 'HEALTHY',lastCompletedAt:completedAt,summary,components,
        ...(failure ? {lastFailedAt:completedAt,lastError:message(failure)} : {lastSucceededAt:completedAt,lastError:FieldValue.delete()}),
      },{mergeFields:['status','lastCompletedAt','summary','components',...(failure ? ['lastFailedAt','lastError'] : ['lastSucceededAt','lastError'])]});
    });
  } catch (error) { console.error('Automation terminal reporting failed',message(error)); failure ||= Error('Automation reporting failed. Completed work has not been rolled back.'); }
  return {success:!failure,runId:run.id,results,summary,components,...(failure ? {error:message(failure)} : {})};
}
