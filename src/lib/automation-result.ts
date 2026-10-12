export function assertAutomationJobsSucceeded(jobs: Record<string, { errors?: number }>) {
  const failures = Object.entries(jobs).filter(([, result]) => Number(result.errors || 0) > 0);
  if (failures.length) throw new Error(`Daily automation has failed jobs: ${failures.map(([name, result]) => `${name} (${result.errors} error(s))`).join(', ')}. Review the run details; completed work has not been rolled back.`);
}
