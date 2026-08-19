import { defineRoute, http } from "@zsys/app";
import { z } from "@zsys/schema";

const missingTarget = {
  ref: { kind: "function", id: "missing.function" },
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
};

const route = defineRoute({
  id: "missing.route",
  method: "GET",
  path: "/missing/:id",
  target: missingTarget,
  request: http.input({ id: http.path("id") }),
  responses: [http.success(200, missingTarget.output)],
});

export default route;
