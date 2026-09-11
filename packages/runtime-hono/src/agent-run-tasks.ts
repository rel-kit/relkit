const tasks = new Map<string, Promise<void>>();

export function trackAgentRun(runId: string, start: () => Promise<void>): void {
  if (tasks.has(runId)) return;
  const task = start();
  tasks.set(runId, task);
  const done = (): void => {
    if (tasks.get(runId) === task) tasks.delete(runId);
  };
  void task.then(done, done);
}

export async function waitForAgentRun(runId: string): Promise<void> {
  await tasks.get(runId);
}
