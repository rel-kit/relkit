import { defineTool } from "@relkit/app/tools";
import hello from "@app/hello/functions/hello.function.js";

export default defineTool({
  id: "hello.lookup",
  target: hello,
  description: "Read a greeting for a supplied name",

  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});
