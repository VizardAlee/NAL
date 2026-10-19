type Time = { toMillis(): number } | null | undefined;
export type HealthInput = { status?: string; lastStartedAt?: Time; lastSucceededAt?: Time; lastError?: string; components?: Record<string,{status?:string}> };
// Existing schedule: 16:00 Africa/Lagos = 15:00 UTC. Thirty minutes allows
// the configured 900-second retry window plus 540-second invocation timeout.
export function automationHealthDisplay(health: HealthInput | null | undefined, now = Date.now()) {
  if (!health) return {label:'Unknown',attention:true,description:'No automation health record is available.'};
  const succeeded = health.lastSucceededAt?.toMillis();
  if (health.status === 'RUNNING') {
    const started = health.lastStartedAt?.toMillis();
    return started == null || now - started > 15 * 60_000
      ? {label:'Overdue — outcome unknown',attention:true,description:'A run is still recorded as running. Review its outcome before considering a retry.'}
      : {label:'Running',attention:false,description:'Component outcomes are recorded as work completes.'};
  }
  if (health.status === 'FAILED') {
    const partial = Object.values(health.components || {}).some(value => value.status === 'SUCCEEDED');
    return {label:partial ? 'Partial failure' : 'Failed',attention:true,description:`${health.lastError || 'Review the recorded component outcomes.'} Completed work has not been rolled back; review outcomes before retrying.`};
  }
  if (health.status !== 'HEALTHY' || succeeded == null) return {label:'Unknown',attention:true,description:'No successful run has been recorded.'};
  const next = new Date(succeeded); next.setUTCHours(15,0,0,0);
  if (next.getTime() <= succeeded) next.setUTCDate(next.getUTCDate()+1);
  if (now > next.getTime()+30*60_000) return {label:'Stale success',attention:true,description:'No successful run is recorded for the latest expected schedule. Review before retrying.'};
  return {label:'Healthy',attention:false,description:'The latest recorded run completed successfully.'};
}
