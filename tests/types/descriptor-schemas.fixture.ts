/** Shares the exact original output schema instance across descriptor type cohorts. */
import { z } from "@relkit/schema";
export const output = z.object({ ok: z.boolean() });
