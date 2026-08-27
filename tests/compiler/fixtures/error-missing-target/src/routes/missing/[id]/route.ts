import { defineRoute, http } from "@relkit/app";
import { z } from "@relkit/schema";

const missingTarget = {
  ref: { kind: "function", id: "missing.function" },
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
};

export const GET = defineRoute({
  id: "missing.route",
  target: missingTarget,
  request: http.input({ id: http.path("id") }),
  responses: [http.success(200, missingTarget.output)],
});
