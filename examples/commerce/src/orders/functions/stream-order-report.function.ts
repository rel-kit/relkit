import { defineFunction, streamOf } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const streamOrderReport = defineFunction({
  input: z.object({ reportId: z.string().min(1) }),
  output: streamOf(z.object({ completed: z.number().int(), total: z.number().int() })),
  handler: async function* (_input, context) {
    for (let completed = 1; completed <= 10; completed += 1) {
      // if (completed > 1) {
      //   await Bun.sleep(1_000);
      // }
      if (context.signal.aborted) return;
      yield { completed, total: completed };
    }
  },
});

export default streamOrderReport;
