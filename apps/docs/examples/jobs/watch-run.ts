import { createClient } from "@relkit/client";
import { watchJobRun } from "@relkit/client/jobs";

export async function watchExport(runId: string): Promise<() => Promise<void>> {
  const client = createClient({ baseUrl: "http://127.0.0.1:3000" });
  const watch = watchJobRun(client, "exportOrders", { runId });
  const unsubscribe = watch.subscribe(({ connection, run }) => {
    console.log(connection, run?.status);
  });
  try {
    await watch.connect();
  } catch (error) {
    unsubscribe();
    await watch.dispose();
    throw error;
  }
  return async () => {
    unsubscribe();
    await watch.dispose();
  };
}
